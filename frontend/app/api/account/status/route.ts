import { NextRequest, NextResponse } from "next/server";
import { setUserActiveStatus } from "../../../../lib/db";
import { getCurrentUserFromCookies } from "../../../../lib/session";

export const runtime = "nodejs";

type Payload = {
  is_active?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromCookies();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: Payload;
    try {
      body = (await request.json()) as Payload;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ ok: false, error: "is_active must be boolean" }, { status: 400 });
    }

    await setUserActiveStatus(user.username, body.is_active);
    return NextResponse.json({ ok: true, is_active: body.is_active });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update account status";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
