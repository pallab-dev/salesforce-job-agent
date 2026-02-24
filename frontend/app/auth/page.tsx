"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AuthMode = "signin" | "signup";
type LoginResponse =
  | {
      ok: true;
      mode: AuthMode;
      user: { id: number; username: string; email_to: string; timezone: string | null };
    }
  | { ok: false; error: string };

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [username, setUsername] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
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
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          username,
          email_to: normalizedEmail,
          timezone
        })
      });

      const data = (await response.json()) as LoginResponse;
      if (!response.ok || !data.ok) {
        setError(data.ok ? "Login failed" : data.error);
        return;
      }

      const isSignup = data.mode === "signup";
      setInfo(isSignup ? "Sign up successful." : "Sign in successful.");
      router.push(isSignup ? "/onboarding" : "/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="card" aria-labelledby="login-title">
        <h1 id="login-title" className="title">
          Job Agent Access
        </h1>
        <p className="subtitle">
          Create a free account or sign in to manage your job alert preferences and workflow.
        </p>
        <p className="footnote">
          New users go through onboarding. Existing users go directly to the dashboard summary.
        </p>

        <div className="mode-switch" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            className={`mode-btn ${mode === "signin" ? "active" : ""}`}
            aria-selected={mode === "signin"}
            onClick={() => {
              setMode("signin");
              setError("");
              setInfo("");
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === "signup" ? "active" : ""}`}
            aria-selected={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setError("");
              setInfo("");
            }}
          >
            Sign Up
          </button>
        </div>

        {info ? <div className="banner ok">{info}</div> : null}
        {error ? <div className="banner err">{error}</div> : null}

        <form onSubmit={onSubmit} className="stack">
          <label className="field">
            Username
            <input
              className="input"
              required
              maxLength={120}
              placeholder="pallab"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
            />
          </label>

          <label className="field">
            Timezone (optional)
            <input
              className="input"
              maxLength={80}
              placeholder="Asia/Kolkata"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "signup" ? "Create Account" : "Sign In"}
          </button>
        </form>

        <p className="footnote">
          `Sign Up` rejects duplicate username/email records. `Sign In` requires an exact username + Gmail match.
        </p>
        <p className="footnote">OAuth is parked for later. This mode still does not verify email ownership.</p>
        <p className="footnote">
          <Link href="/">Back to homepage</Link>
        </p>
      </section>
    </main>
  );
}
