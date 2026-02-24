import { NextResponse } from "next/server";
import { getUserByUsername, insertAdminAuditLog, setUserActiveStatus } from "../../../../../lib/db";
import { getCurrentUserFromCookies, isAdminUser } from "../../../../../lib/session";

export const runtime = "nodejs";

type Payload = {
  username?: unknown;
  is_active?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUserFromCookies();
    if (!isAdminUser(user)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    let body: Payload;
    try {
      body = (await request.json()) as Payload;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const username = typeof body.username === "string" ? body.username.trim() : "";
    const isActive = typeof body.is_active === "boolean" ? body.is_active : null;
    if (!username || isActive === null) {
      return NextResponse.json(
        { ok: false, error: "username and is_active are required" },
        { status: 400 }
      );
    }

    const targetUser = await getUserByUsername(username);
    if (!targetUser) {
      return NextResponse.json({ ok: false, error: "Target user not found" }, { status: 404 });
    }

    await setUserActiveStatus(username, isActive);
    await insertAdminAuditLog({
      adminUserId: user!.id,
      adminUsername: user!.username,
      adminEmailTo: user!.email_to,
      action: isActive ? "activate_user" : "deactivate_user",
      targetUserId: targetUser.id,
      targetUsername: targetUser.username,
      targetEmailTo: targetUser.email_to,
      metadata: {
        new_is_active: isActive
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user status";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
