import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "../../../../lib/session";
import { updateOnboardingProgress } from "../../../../lib/db";

export const runtime = "nodejs";

type ProgressPayload = {
  last_completed_step?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromCookies();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: ProgressPayload;
    try {
      body = (await request.json()) as ProgressPayload;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const rawStep = body.last_completed_step;
    const step = typeof rawStep === "number" ? rawStep : Number(rawStep);
    if (!Number.isInteger(step) || step < 0 || step > 2) {
      return NextResponse.json(
        { ok: false, error: "last_completed_step must be an integer between 0 and 2" },
        { status: 400 }
      );
    }

    await updateOnboardingProgress(user.id, step);
    return NextResponse.json({ ok: true, last_completed_step: step });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update onboarding progress";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
