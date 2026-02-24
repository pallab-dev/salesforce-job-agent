import { NextResponse } from "next/server";
import { listAdminRunLogs, listAdminUserPreferences, listAdminUserState, listAdminUsers } from "../../../../lib/db";
import { getCurrentUserFromCookies, isAdminUser } from "../../../../lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUserFromCookies();
    if (!isAdminUser(user)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const [users, userPreferences, userState, runLogs] = await Promise.all([
      listAdminUsers(),
      listAdminUserPreferences(),
      listAdminUserState(),
      listAdminRunLogs(100)
    ]);

    return NextResponse.json({
      ok: true,
      admin: { username: user!.username, email_to: user!.email_to },
      data: { users, userPreferences, userState, runLogs }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load admin overview";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
