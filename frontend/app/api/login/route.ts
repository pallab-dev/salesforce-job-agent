import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "This endpoint is deprecated. Use /api/login/request-otp and /api/login/verify-otp."
    },
    { status: 410 }
  );
}
