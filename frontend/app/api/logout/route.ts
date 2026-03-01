import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("job_agent_username", "", { path: "/", maxAge: 0 });
  response.cookies.set("job_agent_email", "", { path: "/", maxAge: 0 });
  response.cookies.set("authjs.session-token", "", { path: "/", maxAge: 0 });
  response.cookies.set("__Secure-authjs.session-token", "", { path: "/", maxAge: 0 });
  return response;
}
