from __future__ import annotations

import argparse
import html
import sys
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote

from job_agent.storage import postgres_db


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Minimal login UI for salesforce-job-agent")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8080, help="Port to bind (default: 8080)")
    parser.add_argument("--init-db", action="store_true", help="Initialize schema on startup")
    return parser


def _page_html(*, message: str = "", error: str = "", username: str = "", email_to: str = "", timezone: str = "") -> str:
    banner = ""
    if message:
        banner = f'<div class="banner ok">{html.escape(message)}</div>'
    elif error:
        banner = f'<div class="banner err">{html.escape(error)}</div>'

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Job Agent Login</title>
  <style>
    :root {{
      --bg: #f4efe6;
      --card: #fffaf2;
      --ink: #1f1a14;
      --muted: #6b6258;
      --line: #d9ccb9;
      --accent: #0e7a64;
      --accent-2: #0b5d4d;
      --danger: #a3342b;
      --danger-bg: #fdecea;
      --ok-bg: #e9f8f3;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 10% 10%, #efe4d1 0, transparent 45%),
        radial-gradient(circle at 90% 0%, #d7ebdf 0, transparent 35%),
        var(--bg);
      display: grid;
      place-items: center;
      padding: 24px;
    }}
    .card {{
      width: min(560px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 14px 40px rgba(20, 16, 10, 0.08);
    }}
    h1 {{
      margin: 0 0 6px;
      font-size: 1.8rem;
    }}
    p {{
      margin: 0 0 16px;
      color: var(--muted);
      line-height: 1.4;
    }}
    form {{
      display: grid;
      gap: 12px;
    }}
    label {{
      display: grid;
      gap: 6px;
      font-size: 0.95rem;
    }}
    input {{
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      font: inherit;
      background: #fff;
    }}
    button {{
      margin-top: 4px;
      border: 0;
      border-radius: 10px;
      padding: 11px 14px;
      font: inherit;
      color: #fff;
      background: linear-gradient(180deg, var(--accent), var(--accent-2));
      cursor: pointer;
    }}
    button:hover {{
      filter: brightness(1.02);
    }}
    .banner {{
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 12px;
      border: 1px solid transparent;
      font-size: 0.95rem;
    }}
    .banner.ok {{
      background: var(--ok-bg);
      border-color: #bfe9d9;
      color: #145c4a;
    }}
    .banner.err {{
      background: var(--danger-bg);
      border-color: #f4c8c2;
      color: var(--danger);
    }}
    .foot {{
      margin-top: 12px;
      font-size: 0.85rem;
      color: var(--muted);
    }}
  </style>
</head>
<body>
  <main class="card">
    <h1>Job Agent Login</h1>
    <p>Minimal UI: creates or updates a user record in PostgreSQL on login.</p>
    {banner}
    <form method="post" action="/login">
      <label>
        Username
        <input name="username" required maxlength="120" value="{html.escape(username)}" placeholder="pallab">
      </label>
      <label>
        Email
        <input type="email" name="email_to" required maxlength="320" value="{html.escape(email_to)}" placeholder="you@example.com">
      </label>
      <label>
        Timezone (optional)
        <input name="timezone" maxlength="80" value="{html.escape(timezone)}" placeholder="Asia/Kolkata">
      </label>
      <button type="submit">Login / Register</button>
    </form>
    <div class="foot">This is a minimal prototype and does not implement password-based authentication yet.</div>
  </main>
</body>
</html>
"""


class LoginHandler(BaseHTTPRequestHandler):
    server_version = "JobAgentLogin/0.1"

    def do_GET(self) -> None:  # noqa: N802
        if self.path not in {"/", "/index.html"}:
            self._send_text(HTTPStatus.NOT_FOUND, "Not Found")
            return
        username = self._cookie_value("job_agent_user")
        message = f"Logged in as {username}. User record is stored in DB." if username else ""
        self._send_html(HTTPStatus.OK, _page_html(message=message))

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/login":
            self._send_text(HTTPStatus.NOT_FOUND, "Not Found")
            return

        content_length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(max(content_length, 0))
        form = parse_qs(raw.decode("utf-8", errors="ignore"), keep_blank_values=False)

        username = (form.get("username", [""])[0] or "").strip()
        email_to = (form.get("email_to", [""])[0] or "").strip()
        timezone = (form.get("timezone", [""])[0] or "").strip() or None

        if not username or not email_to:
            self._send_html(
                HTTPStatus.BAD_REQUEST,
                _page_html(
                    error="Username and email are required.",
                    username=username,
                    email_to=email_to,
                    timezone=timezone or "",
                ),
            )
            return

        if "@" not in email_to:
            self._send_html(
                HTTPStatus.BAD_REQUEST,
                _page_html(
                    error="Please enter a valid email address.",
                    username=username,
                    email_to=email_to,
                    timezone=timezone or "",
                ),
            )
            return

        try:
            with postgres_db.connect() as conn:
                user = postgres_db.upsert_user(
                    conn,
                    username=username,
                    email_to=email_to,
                    timezone=timezone,
                    is_active=True,
                )
        except Exception as exc:
            self._send_html(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                _page_html(
                    error=f"DB error: {exc}",
                    username=username,
                    email_to=email_to,
                    timezone=timezone or "",
                ),
            )
            return

        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", "/")
        self.send_header(
            "Set-Cookie",
            f"job_agent_user={quote(user.username)}; Path=/; SameSite=Lax",
        )
        self.end_headers()

    def log_message(self, fmt: str, *args: object) -> None:
        # Keep local development logs short.
        sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def _send_html(self, status: HTTPStatus, body: str) -> None:
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_text(self, status: HTTPStatus, body: str) -> None:
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _cookie_value(self, name: str) -> str:
        raw = self.headers.get("Cookie") or ""
        if not raw.strip():
            return ""
        jar = SimpleCookie()
        jar.load(raw)
        morsel = jar.get(name)
        return morsel.value if morsel else ""


def main() -> int:
    args = build_parser().parse_args()

    if args.init_db:
        with postgres_db.connect() as conn:
            postgres_db.init_schema(conn)
        print("PostgreSQL schema initialized.")

    server = ThreadingHTTPServer((args.host, args.port), LoginHandler)
    print(f"Serving minimal login UI on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        return 130
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
