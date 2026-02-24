import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, getUserByUsername, setUserActiveStatus, upsertUser } from "../../../lib/db";

export const runtime = "nodejs";

type LoginPayload = {
  mode?: unknown;
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
  const emailTo = asTrimmedString(body.email_to).toLowerCase();
  const timezone = asTrimmedString(body.timezone);
  const mode = asTrimmedString(body.mode).toLowerCase();

  if (mode !== "signin" && mode !== "signup") {
    return NextResponse.json({ ok: false, error: "mode must be 'signin' or 'signup'" }, { status: 400 });
  }

  if (!username || !emailTo) {
    return NextResponse.json(
      { ok: false, error: "username and email_to are required" },
      { status: 400 }
    );
  }

  if (!emailTo.includes("@")) {
    return NextResponse.json({ ok: false, error: "Invalid email address" }, { status: 400 });
  }
  if (!emailTo.endsWith("@gmail.com")) {
    return NextResponse.json({ ok: false, error: "Please use a Gmail address for this prototype" }, { status: 400 });
  }

  try {
    let user;
    if (mode === "signin") {
      const existingByUsername = await getUserByUsername(username);
      if (!existingByUsername) {
        return NextResponse.json(
          { ok: false, error: "User not found. Please sign up first." },
          { status: 404 }
        );
      }
      if (existingByUsername.email_to.toLowerCase() !== emailTo) {
        return NextResponse.json(
          { ok: false, error: "Username and Gmail do not match our records." },
          { status: 400 }
        );
      }
      if (!existingByUsername.is_active) {
        await setUserActiveStatus(existingByUsername.username, true);
        user = { ...existingByUsername, is_active: true };
      } else {
        user = existingByUsername;
      }
    } else {
      const [existingByUsername, existingByEmail] = await Promise.all([
        getUserByUsername(username),
        getUserByEmail(emailTo)
      ]);
      if (existingByUsername) {
        if (existingByUsername.email_to.toLowerCase() === emailTo) {
          return NextResponse.json(
            { ok: false, error: "User already exists. Please sign in." },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { ok: false, error: "Username is already taken. Use a different username." },
          { status: 409 }
        );
      }
      if (existingByEmail) {
        return NextResponse.json(
          { ok: false, error: `This Gmail is already registered as '${existingByEmail.username}'. Please sign in.` },
          { status: 409 }
        );
      }

      user = await upsertUser({
        username,
        emailTo,
        timezone: timezone || null
      });
    }

    const response = NextResponse.json({
      ok: true,
      mode,
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
