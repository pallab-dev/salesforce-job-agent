import { NextRequest, NextResponse } from "next/server";
import { upsertUser } from "../../../lib/db";

export const runtime = "nodejs";

type LoginPayload = {
  username?: unknown;
  email_to?: unknown;
  timezone?: unknown;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  let body: LoginPayload;
  try {
    body = (await request.json()) as LoginPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const username = asTrimmedString(body.username);
  const emailTo = asTrimmedString(body.email_to);
  const timezone = asTrimmedString(body.timezone);

  if (!username || !emailTo) {
    return NextResponse.json(
      { ok: false, error: "username and email_to are required" },
      { status: 400 }
    );
  }

  if (!emailTo.includes("@")) {
    return NextResponse.json({ ok: false, error: "Invalid email address" }, { status: 400 });
  }

  try {
    const user = await upsertUser({
      username,
      emailTo,
      timezone: timezone || null
    });

    const response = NextResponse.json({
      ok: true,
      user: {
        id: Number(user.id),
        username: String(user.username),
        email_to: String(user.email_to),
        timezone: user.timezone ? String(user.timezone) : null
      }
    });

    response.cookies.set("job_agent_username", String(user.username), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
    response.cookies.set("job_agent_email", String(user.email_to), {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
