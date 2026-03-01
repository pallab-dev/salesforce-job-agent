"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AuthMode = "signin" | "signup";

type SessionStatusResponse =
  | { ok: true; authenticated: boolean; user: { username: string; email_to: string } | null }
  | { ok: false; error: string };

type OtpRequestResponse =
  | {
      ok: true;
      challenge_id: string;
      expires_in_seconds: number;
      delivery: "resend" | "postmark" | "sendgrid" | "smtp" | "dev_fallback";
      dev_otp?: string;
      info?: string;
    }
  | { ok: false; error: string };

type VerifyResponse =
  | {
      ok: true;
      mode: AuthMode;
      user: { id: number; username: string; email_to: string; timezone: string | null };
    }
  | { ok: false; error: string };

export default function AuthPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>("signup");
  const [username, setUsername] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [timezone, setTimezone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/account/session", { method: "GET" });
        const data = (await response.json()) as SessionStatusResponse;
        if (!active) {
          return;
        }
        if (response.ok && data.ok && data.authenticated) {
          router.replace("/dashboard");
          return;
        }
      } catch {
        // non-blocking: allow auth page rendering
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, [router]);

  function resetChallengeState(nextMode: AuthMode) {
    setMode(nextMode);
    setChallengeId("");
    setOtpCode("");
    setError("");
    setInfo("");
  }

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    const normalizedEmail = emailTo.trim().toLowerCase();
    if (!normalizedEmail.endsWith("@gmail.com")) {
      setLoading(false);
      setError("Please use a Gmail address (ending with @gmail.com).");
      return;
    }

    try {
      const response = await fetch("/api/login/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          username,
          email_to: normalizedEmail
        })
      });
      const data = (await response.json()) as OtpRequestResponse;
      if (!response.ok || !data.ok) {
        setError(data.ok ? "Failed to request OTP" : data.error);
        return;
      }
      setChallengeId(data.challenge_id);
      if (data.delivery === "dev_fallback" && data.dev_otp) {
        setInfo(`OTP generated (dev fallback): ${data.dev_otp}`);
      } else {
        setInfo("OTP sent to your Gmail. Enter the 6-digit code to continue.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to request OTP");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerifying(true);
    setError("");
    setInfo("");

    const normalizedEmail = emailTo.trim().toLowerCase();
    try {
      const response = await fetch("/api/login/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          username,
          email_to: normalizedEmail,
          timezone,
          challenge_id: challengeId,
          otp_code: otpCode.trim()
        })
      });
      const data = (await response.json()) as VerifyResponse;
      if (!response.ok || !data.ok) {
        setError(data.ok ? "OTP verification failed" : data.error);
        return;
      }

      const isSignup = data.mode === "signup";
      setInfo(isSignup ? "Sign up complete." : "Sign in complete.");
      router.push(isSignup ? "/onboarding" : "/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "OTP verification failed");
    } finally {
      setVerifying(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="page-shell">
        <section className="card">
          <p className="footnote">Checking session...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="card" aria-labelledby="login-title">
        <h1 id="login-title" className="title">
          {mode === "signup" ? "Create Your Account" : "Welcome Back"}
        </h1>
        <p className="subtitle">
          {mode === "signup"
            ? "Sign up with Gmail OTP and start your onboarding flow."
            : "Already signed up users can log in with Gmail OTP."}
        </p>

        {info ? <div className="banner ok">{info}</div> : null}
        {error ? <div className="banner err">{error}</div> : null}

        <div className="prefs-section-card">
          <div className="prefs-section-head">
            <h3>Google OAuth</h3>
            <p>Fast sign-in for existing users.</p>
          </div>
          <a className="btn btn-link" href="/api/auth/signin/google?callbackUrl=/api/auth/sync-session">
            Continue with Google
          </a>
        </div>

        <form onSubmit={requestOtp} className="stack">
          <label className="field">
            Username
            <input
              className="input"
              required
              maxLength={120}
              placeholder="pallab"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={Boolean(challengeId)}
            />
          </label>

          <label className="field">
            Gmail
            <input
              className="input"
              required
              type="email"
              maxLength={320}
              placeholder="you@gmail.com"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              disabled={Boolean(challengeId)}
            />
          </label>

          <label className="field">
            Timezone (optional)
            <input
              className="input"
              maxLength={80}
              placeholder="America/New_York"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={Boolean(challengeId)}
            />
          </label>

          <button className="btn" type="submit" disabled={loading || Boolean(challengeId)}>
            {loading ? "Sending OTP..." : mode === "signup" ? "Sign Up with OTP" : "Log In with OTP"}
          </button>
        </form>

        {challengeId ? (
          <form onSubmit={verifyOtp} className="stack otp-section" aria-label="Verify OTP">
            <label className="field">
              Enter OTP
              <input
                className="input"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="6-digit code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D+/g, "").slice(0, 6))}
              />
            </label>
            <div className="cta-row">
              <button className="btn" type="submit" disabled={verifying || otpCode.length !== 6}>
                {verifying ? "Verifying..." : mode === "signup" ? "Verify & Create Account" : "Verify & Log In"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setChallengeId("");
                  setOtpCode("");
                  setError("");
                  setInfo("");
                }}
              >
                Change Details
              </button>
            </div>
          </form>
        ) : null}

        <p className="footnote">
          {mode === "signup" ? (
            <>
              Already signed up?{" "}
              <button className="inline-link-btn" type="button" onClick={() => resetChallengeState("signin")}>
                Click to login
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button className="inline-link-btn" type="button" onClick={() => resetChallengeState("signup")}>
                Create an account
              </button>
            </>
          )}
        </p>

        <p className="footnote">
          <Link href="/">Back to homepage</Link>
        </p>
      </section>
    </main>
  );
}
