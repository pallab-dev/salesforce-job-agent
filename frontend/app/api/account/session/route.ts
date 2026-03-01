import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "../../../../lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUserFromCookies();
    return NextResponse.json({
      ok: true,
      authenticated: Boolean(user),
      user: user
        ? {
            username: user.username,
            email_to: user.email_to
          }
        : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve session";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
