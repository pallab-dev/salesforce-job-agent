import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { getUserByEmail, upsertUser } from "../../../../lib/db";

export const runtime = "nodejs";

function usernameFromEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function GET(request: Request) {
  const session = await auth();
  const email = (session?.user?.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.redirect(new URL("/auth?error=oauth_session", request.url));
  }

  const existing = await getUserByEmail(email);
  const user = await upsertUser({
    username: existing?.username || usernameFromEmail(email),
    emailTo: email,
    timezone: null
  });

  const response = NextResponse.redirect(new URL(existing ? "/dashboard" : "/onboarding", request.url));
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
}
