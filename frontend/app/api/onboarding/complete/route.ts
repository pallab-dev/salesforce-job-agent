import { NextResponse } from "next/server";
import { markOnboardingCompleted } from "../../../../lib/db";
import { getCurrentUserFromCookies } from "../../../../lib/session";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await getCurrentUserFromCookies();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await markOnboardingCompleted(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark onboarding complete";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
