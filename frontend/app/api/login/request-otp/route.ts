import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createEmailOtpChallenge,
  countRecentEmailOtpRequests,
  getUserByEmail,
  getUserByUsername
} from "../../../../lib/db";
import { sendOtpEmail } from "../../../../lib/otp-delivery";

export const runtime = "nodejs";

type AuthMode = "signin" | "signup";

type RequestOtpPayload = {
  mode?: unknown;
  username?: unknown;
  email_to?: unknown;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMode(raw: unknown): AuthMode | null {
  const value = asTrimmedString(raw).toLowerCase();
  if (value === "signin" || value === "signup") {
    return value;
  }
  return null;
}

function getOtpSecret(): string {
  const secret = process.env.OTP_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  return secret || "local-dev-otp-secret";
}

function hashOtp(challengeId: string, otp: string): string {
  return crypto.createHash("sha256").update(`${challengeId}:${otp}:${getOtpSecret()}`).digest("hex");
}

function generateOtpCode(): string {
  const value = crypto.randomInt(0, 1_000_000);
  return String(value).padStart(6, "0");
}

export async function POST(request: NextRequest) {
  let body: RequestOtpPayload;
  try {
    body = (await request.json()) as RequestOtpPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = normalizeMode(body.mode);
  const username = asTrimmedString(body.username);
  const emailTo = asTrimmedString(body.email_to).toLowerCase();

  if (!mode) {
    return NextResponse.json({ ok: false, error: "mode must be 'signin' or 'signup'" }, { status: 400 });
  }
  if (!username || !emailTo) {
    return NextResponse.json({ ok: false, error: "username and email_to are required" }, { status: 400 });
  }
  if (!emailTo.includes("@") || !emailTo.endsWith("@gmail.com")) {
    return NextResponse.json(
      { ok: false, error: "Please use a valid Gmail address (ending with @gmail.com)." },
      { status: 400 }
    );
  }

  try {
    const recentRequests = await countRecentEmailOtpRequests(emailTo, 10);
    if (recentRequests >= 5) {
      return NextResponse.json(
        { ok: false, error: "Too many OTP requests. Please wait 10 minutes and try again." },
        { status: 429 }
      );
    }

    if (mode === "signin") {
      const existingByUsername = await getUserByUsername(username);
      if (!existingByUsername) {
        return NextResponse.json({ ok: false, error: "User not found. Please sign up first." }, { status: 404 });
      }
      if (existingByUsername.email_to.toLowerCase() !== emailTo) {
        return NextResponse.json(
          { ok: false, error: "Username and Gmail do not match our records." },
          { status: 400 }
        );
      }
    } else {
      const [existingByUsername, existingByEmail] = await Promise.all([
        getUserByUsername(username),
        getUserByEmail(emailTo)
      ]);
      if (existingByUsername) {
        if (existingByUsername.email_to.toLowerCase() === emailTo) {
          return NextResponse.json({ ok: false, error: "User already exists. Please sign in." }, { status: 409 });
        }
        return NextResponse.json(
          { ok: false, error: "Username is already taken. Use a different username." },
          { status: 409 }
        );
      }
      if (existingByEmail) {
        return NextResponse.json(
          {
            ok: false,
            error: `This Gmail is already registered as '${existingByEmail.username}'. Please sign in.`
          },
          { status: 409 }
        );
      }
    }

    const otp = generateOtpCode();
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await createEmailOtpChallenge({
      challengeId,
      mode,
      username,
      emailTo,
      otpHash: hashOtp(challengeId, otp),
      expiresAt,
      maxAttempts: 5
    });

    const delivery = await sendOtpEmail({ to: emailTo, username, otp });
    if (!delivery.delivered) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { ok: false, error: "OTP delivery is not configured. Please contact support." },
          { status: 500 }
        );
      }
      return NextResponse.json({
        ok: true,
        challenge_id: challengeId,
        expires_in_seconds: 600,
        delivery: "dev_fallback",
        dev_otp: otp,
        info: `Email provider not configured (${delivery.reason || "unknown"}). Using dev OTP fallback.`
      });
    }

    return NextResponse.json({
      ok: true,
      challenge_id: challengeId,
      expires_in_seconds: 600,
      delivery: delivery.provider
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send OTP";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
