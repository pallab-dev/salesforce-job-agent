import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  consumeEmailOtpChallenge,
  getEmailOtpChallenge,
  getUserByEmail,
  getUserByUsername,
  incrementEmailOtpAttempts,
  setUserActiveStatus,
  upsertUser
} from "../../../../lib/db";

export const runtime = "nodejs";

type AuthMode = "signin" | "signup";

type VerifyOtpPayload = {
  mode?: unknown;
  username?: unknown;
  email_to?: unknown;
  timezone?: unknown;
  challenge_id?: unknown;
  otp_code?: unknown;
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

export async function POST(request: NextRequest) {
  let body: VerifyOtpPayload;
  try {
    body = (await request.json()) as VerifyOtpPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = normalizeMode(body.mode);
  const username = asTrimmedString(body.username);
  const emailTo = asTrimmedString(body.email_to).toLowerCase();
  const timezone = asTrimmedString(body.timezone) || null;
  const challengeId = asTrimmedString(body.challenge_id);
  const otpCode = asTrimmedString(body.otp_code);

  if (!mode || !username || !emailTo || !challengeId || !otpCode) {
    return NextResponse.json(
      {
        ok: false,
        error: "mode, username, email_to, challenge_id, and otp_code are required"
      },
      { status: 400 }
    );
  }

  if (!/^\d{6}$/.test(otpCode)) {
    return NextResponse.json({ ok: false, error: "OTP code must be a 6-digit number" }, { status: 400 });
  }

  try {
    const challenge = await getEmailOtpChallenge(challengeId);
    if (!challenge) {
      return NextResponse.json({ ok: false, error: "OTP challenge not found" }, { status: 404 });
    }

    if (challenge.consumed_at) {
      return NextResponse.json({ ok: false, error: "OTP challenge already used" }, { status: 400 });
    }

    if (challenge.mode !== mode || challenge.username !== username || challenge.email_to.toLowerCase() !== emailTo) {
      return NextResponse.json({ ok: false, error: "OTP challenge details do not match" }, { status: 400 });
    }

    if (challenge.attempts_used >= challenge.max_attempts) {
      return NextResponse.json({ ok: false, error: "OTP attempts exceeded. Request a new code." }, { status: 429 });
    }

    const now = Date.now();
    const expiresAtMs = new Date(challenge.expires_at).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
      return NextResponse.json({ ok: false, error: "OTP expired. Request a new code." }, { status: 400 });
    }

    const inputHash = hashOtp(challengeId, otpCode);
    if (inputHash !== challenge.otp_hash) {
      await incrementEmailOtpAttempts(challengeId);
      return NextResponse.json({ ok: false, error: "Invalid OTP code" }, { status: 400 });
    }

    await consumeEmailOtpChallenge(challengeId);

    let user;
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
      if (!existingByUsername.is_active) {
        await setUserActiveStatus(existingByUsername.username, true);
        user = { ...existingByUsername, is_active: true };
      } else {
        user = existingByUsername;
      }
    } else {
      const [existingByUsername, existingByEmail] = await Promise.all([
        getUserByUsername(username),
        getUserByEmail(emailTo)
      ]);
      if (existingByUsername || existingByEmail) {
        return NextResponse.json(
          { ok: false, error: "Account already exists. Please use Sign In." },
          { status: 409 }
        );
      }
      user = await upsertUser({
        username,
        emailTo,
        timezone
      });
    }

    const response = NextResponse.json({
      ok: true,
      mode,
      user: {
        id: Number(user.id),
        username: String(user.username),
        email_to: String(user.email_to),
        timezone: user.timezone ? String(user.timezone) : null
      }
    });

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
  } catch (error) {
    const message = error instanceof Error ? error.message : "OTP verification failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
