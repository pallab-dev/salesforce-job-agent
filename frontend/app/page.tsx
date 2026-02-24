"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginResponse =
  | { ok: true; user: { id: number; username: string; email_to: string; timezone: string | null } }
  | { ok: false; error: string };

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email_to: emailTo,
          timezone
        })
      });

      const data = (await response.json()) as LoginResponse;
      if (!response.ok || !data.ok) {
        setError(data.ok ? "Login failed" : data.error);
        return;
      }

      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="card" aria-labelledby="login-title">
        <h1 id="login-title" className="title">
          Job Agent Login
        </h1>
        <p className="subtitle">
          Simple prototype login using <code>username</code> and <code>gmail</code>. This creates or updates your user
          in PostgreSQL <code>users</code>.
        </p>

        {error ? <div className="banner err">{error}</div> : null}

        <form onSubmit={onSubmit} className="stack">
          <label className="field">
            Username
            <input
              className="input"
              required
              maxLength={120}
              placeholder="pallab"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="field">
            Gmail
            <input
              className="input"
              required
              type="email"
              maxLength={320}
              placeholder="you@gmail.com"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
            />
          </label>

          <label className="field">
            Timezone (optional)
            <input
              className="input"
              maxLength={80}
              placeholder="Asia/Kolkata"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Saving..." : "Login / Register"}
          </button>
        </form>

        <p className="footnote">
          OAuth is parked for later. This mode does not verify email ownership yet.
        </p>
      </section>
    </main>
  );
}
