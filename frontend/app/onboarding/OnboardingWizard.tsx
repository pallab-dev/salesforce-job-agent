"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PrefsState = {
  keyword: string;
  llm_input_limit: number | "";
  max_bullets: number | "";
  remote_only: boolean;
  strict_senior_only: boolean;
  experience_level: string;
  target_roles: string[];
  tech_stack_tags: string[];
  alert_frequency: string;
  primary_goal: string;
};

type PrefsApiResponse =
  | {
      ok: true;
      user?: { id: number; username: string; email_to: string; timezone: string | null };
      preferences: PrefsState;
    }
  | { ok: false; error: string };

type UserSummary = {
  username: string;
  email: string;
};

const steps = ["Account", "Preferences", "Workflow", "Finish"] as const;

export default function OnboardingWizard({
  user,
  initialStep = 0
}: {
  user: UserSummary;
  initialStep?: number;
}) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(Math.max(0, Math.min(steps.length - 1, initialStep)));
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [prefs, setPrefs] = useState<PrefsState>({
    keyword: "",
    llm_input_limit: "",
    max_bullets: "",
    remote_only: false,
    strict_senior_only: false,
    experience_level: "",
    target_roles: [],
    tech_stack_tags: [],
    alert_frequency: "",
    primary_goal: ""
  });

  useEffect(() => {
    let active = true;
    async function loadPrefs() {
      setLoadingPrefs(true);
      try {
        const response = await fetch("/api/preferences");
        const data = (await response.json()) as PrefsApiResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.ok ? "Failed to load preferences" : data.error);
        }
        if (!active) {
          return;
        }
        setPrefs(data.preferences);
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Failed to load preferences");
        }
      } finally {
        if (active) {
          setLoadingPrefs(false);
        }
      }
    }
    void loadPrefs();
    return () => {
      active = false;
    };
  }, []);

  const progressPercent = useMemo(() => ((stepIndex + 1) / steps.length) * 100, [stepIndex]);
  const completionChecklist = useMemo(
    () => [
      { label: "Username", done: Boolean(user.username) },
      { label: "Gmail", done: Boolean(user.email) },
      { label: "Keyword", done: Boolean((prefs.keyword || "").trim()) },
      { label: "LLM input limit", done: Boolean(prefs.llm_input_limit) },
      { label: "Max bullets", done: Boolean(prefs.max_bullets) },
      { label: "Remote preference", done: prefs.remote_only !== null && prefs.remote_only !== undefined },
      {
        label: "Seniority preference",
        done: prefs.strict_senior_only !== null && prefs.strict_senior_only !== undefined
      },
      { label: "Experience level", done: Boolean(prefs.experience_level) },
      { label: "Target roles", done: prefs.target_roles.length > 0 },
      { label: "Tech stack tags", done: prefs.tech_stack_tags.length > 0 },
      { label: "Alert frequency", done: Boolean(prefs.alert_frequency) },
      { label: "Primary goal", done: Boolean(prefs.primary_goal) }
    ],
    [prefs, user.email, user.username]
  );
  const onboardingCompletion = Math.round(
    (completionChecklist.filter((item) => item.done).length / completionChecklist.length) * 100
  );
  const onboardingImpact =
    onboardingCompletion >= 90
      ? "High expected relevance"
      : onboardingCompletion >= 65
        ? "Medium expected relevance"
        : "Low expected relevance until setup is completed";
  const onboardingMissing = completionChecklist.filter((item) => !item.done).map((item) => item.label);

  async function savePreferences() {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs)
      });
      const data = (await response.json()) as PrefsApiResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? "Failed to save preferences" : data.error);
      }
      setPrefs(data.preferences);
      setInfo("Preferences saved.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save preferences");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveOnboardingProgress(lastCompletedStep: number) {
    try {
      await fetch("/api/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ last_completed_step: lastCompletedStep })
      });
    } catch {
      // Non-blocking. Resume support is helpful but should not block onboarding flow.
    }
  }

  async function onNext() {
    setError("");
    setInfo("");

    if (stepIndex === 1) {
      const ok = await savePreferences();
      if (!ok) {
        return;
      }
    }

    if (stepIndex < steps.length - 1) {
      void saveOnboardingProgress(stepIndex);
      setStepIndex((s) => s + 1);
      return;
    }

    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } catch {
      // Non-blocking for UX; dashboard completion can still be derived from preferences.
    }
    router.push("/dashboard");
  }

  function onBack() {
    setError("");
    setInfo("");
    setStepIndex((s) => Math.max(0, s - 1));
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-header">
        <div>
          <p className="eyebrow">Onboarding Workflow</p>
          <h1 className="title onboarding-title">Set up your job alert workflow</h1>
          <p className="subtitle">
            This is a guided setup before the dashboard. You can change everything later from the dashboard.
          </p>
        </div>
        <Link className="btn btn-secondary btn-link" href="/dashboard">
          Skip to Dashboard
        </Link>
      </div>

      <div className="onboarding-progress-card">
        <div className="onboarding-steps">
          {steps.map((step, idx) => (
            <div
              key={step}
              className={`onboarding-step-pill ${idx === stepIndex ? "active" : ""} ${idx < stepIndex ? "done" : ""}`}
            >
              <span>{idx + 1}</span>
              {step}
            </div>
          ))}
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="onboarding-score-card">
        <div>
          <span className="summary-label">Profile setup completion</span>
          <strong className="summary-value">{onboardingCompletion}%</strong>
          <p className="summary-help">{onboardingImpact}</p>
        </div>
        {onboardingMissing.length > 0 ? (
          <div className="onboarding-missing-mini">
            <span className="summary-label">Missing</span>
            <ul className="simple-list compact-list">
              {onboardingMissing.slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="completion-badge high">Ready for alerts</div>
        )}
      </div>

      {info ? <div className="banner ok">{info}</div> : null}
      {error ? <div className="banner err">{error}</div> : null}

      <section className="card onboarding-card">
        {stepIndex === 0 ? (
          <div className="stack">
            <h2 className="section-title no-top">Account Summary</h2>
            <p className="subtitle compact">
              You are signed in using the prototype username + Gmail flow. We use this to load your saved preferences.
            </p>
            <div className="grid-two">
              <label className="field">
                Username
                <input className="input" readOnly value={user.username} />
              </label>
              <label className="field">
                Gmail
                <input className="input" readOnly value={user.email} />
              </label>
            </div>
          </div>
        ) : null}

        {stepIndex === 1 ? (
          <div className="stack">
            <h2 className="section-title no-top">Preferences</h2>
            <p className="subtitle compact">These values will be saved into your existing `user_preferences` record.</p>
            {loadingPrefs ? <p className="footnote">Loading preferences...</p> : null}
            <label className="field">
              Keyword
              <input
                className="input"
                maxLength={120}
                placeholder="developer"
                value={prefs.keyword}
                onChange={(e) => setPrefs((p) => ({ ...p, keyword: e.target.value }))}
              />
            </label>
            <div className="grid-two">
              <label className="field">
                LLM Input Limit
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="15"
                  value={prefs.llm_input_limit}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      llm_input_limit: e.target.value === "" ? "" : Number(e.target.value)
                    }))
                  }
                />
              </label>
              <label className="field">
                Max Bullets
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="8"
                  value={prefs.max_bullets}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      max_bullets: e.target.value === "" ? "" : Number(e.target.value)
                    }))
                  }
                />
              </label>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={prefs.remote_only}
                onChange={(e) => setPrefs((p) => ({ ...p, remote_only: e.target.checked }))}
              />
              <span>Remote only</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={prefs.strict_senior_only}
                onChange={(e) => setPrefs((p) => ({ ...p, strict_senior_only: e.target.checked }))}
              />
              <span>Strict senior only</span>
            </label>

            <div className="prefs-section-card">
              <div className="prefs-section-head">
                <h3>Profile Signals (for better alerts)</h3>
                <p>Used to improve personalization and product learning as we iterate.</p>
              </div>
              <div className="grid-two">
                <label className="field">
                  Experience level
                  <select
                    className="input"
                    value={prefs.experience_level}
                    onChange={(e) => setPrefs((p) => ({ ...p, experience_level: e.target.value }))}
                  >
                    <option value="">Select...</option>
                    <option value="entry">Entry</option>
                    <option value="mid">Mid</option>
                    <option value="senior">Senior</option>
                    <option value="staff">Staff/Principal</option>
                  </select>
                </label>
                <label className="field">
                  Alert frequency
                  <select
                    className="input"
                    value={prefs.alert_frequency}
                    onChange={(e) => setPrefs((p) => ({ ...p, alert_frequency: e.target.value }))}
                  >
                    <option value="">Select...</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="high_priority_only">High priority only</option>
                  </select>
                </label>
              </div>
              <div className="grid-two">
                <label className="field">
                  Target roles (comma-separated)
                  <input
                    className="input"
                    placeholder="backend, platform, fullstack"
                    value={prefs.target_roles.join(", ")}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        target_roles: e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean)
                      }))
                    }
                  />
                </label>
                <label className="field">
                  Tech stack tags (comma-separated)
                  <input
                    className="input"
                    placeholder="python, aws, salesforce"
                    value={prefs.tech_stack_tags.join(", ")}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        tech_stack_tags: e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean)
                      }))
                    }
                  />
                </label>
              </div>
              <label className="field">
                Primary goal
                <select
                  className="input"
                  value={prefs.primary_goal}
                  onChange={(e) => setPrefs((p) => ({ ...p, primary_goal: e.target.value }))}
                >
                  <option value="">Select...</option>
                  <option value="job_switch">Job switch</option>
                  <option value="market_tracking">Market tracking</option>
                  <option value="interview_pipeline">Interview pipeline</option>
                </select>
              </label>
            </div>
          </div>
        ) : null}

        {stepIndex === 2 ? (
          <div className="stack">
            <h2 className="section-title no-top">How your workflow will run</h2>
            <div className="workflow-lanes">
              <div className="workflow-step">
                <span className="step-index">1</span>
                <div>
                  <strong>Job sources are fetched</strong>
                  <p>Configured sources (RemoteOK, Remotive, ATS boards) collect candidate jobs.</p>
                </div>
              </div>
              <div className="workflow-step">
                <span className="step-index">2</span>
                <div>
                  <strong>Your preferences are applied</strong>
                  <p>
                    Keyword: <code>{prefs.keyword || "developer"}</code>, remote-only:{" "}
                    <code>{String(prefs.remote_only)}</code>, strict senior:{" "}
                    <code>{String(prefs.strict_senior_only)}</code>.
                  </p>
                  <p>
                    Experience: <code>{prefs.experience_level || "-"}</code>, alert frequency:{" "}
                    <code>{prefs.alert_frequency || "-"}</code>
                  </p>
                </div>
              </div>
              <div className="workflow-step">
                <span className="step-index">3</span>
                <div>
                  <strong>AI filtering runs</strong>
                  <p>
                    Up to <code>{prefs.llm_input_limit || "-"}</code> jobs are shortlisted and formatted into up to{" "}
                    <code>{prefs.max_bullets || "-"}</code> results.
                  </p>
                </div>
              </div>
              <div className="workflow-step">
                <span className="step-index">4</span>
                <div>
                  <strong>Dashboard and admin visibility</strong>
                  <p>You can continue editing preferences later; admins can monitor operational state.</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {stepIndex === 3 ? (
          <div className="stack">
            <h2 className="section-title no-top">Setup complete</h2>
            <p className="subtitle compact">
              Your workflow setup is ready. Continue to the dashboard to manage preferences anytime.
            </p>
            <div className="feature-card finish-summary">
              <h3>Current setup summary</h3>
              <p>
                <strong>User:</strong> {user.username} ({user.email})
              </p>
              <p>
                <strong>Keyword:</strong> {prefs.keyword || "developer"}
              </p>
              <p>
                <strong>Experience:</strong> {prefs.experience_level || "-"} | <strong>Alert frequency:</strong>{" "}
                {prefs.alert_frequency || "-"}
              </p>
              <p>
                <strong>Target roles:</strong> {prefs.target_roles.join(", ") || "-"}
              </p>
              <p>
                <strong>Tech stack:</strong> {prefs.tech_stack_tags.join(", ") || "-"} | <strong>Primary goal:</strong>{" "}
                {prefs.primary_goal || "-"}
              </p>
              <p>
                <strong>Remote only:</strong> {String(prefs.remote_only)} | <strong>Strict senior:</strong>{" "}
                {String(prefs.strict_senior_only)}
              </p>
              <p>
                <strong>LLM input limit:</strong> {prefs.llm_input_limit || "-"} | <strong>Max bullets:</strong>{" "}
                {prefs.max_bullets || "-"}
              </p>
            </div>
          </div>
        ) : null}

        <div className="onboarding-actions">
          <button className="btn btn-secondary" type="button" onClick={onBack} disabled={stepIndex === 0 || saving}>
            Back
          </button>
          <button className="btn" type="button" onClick={onNext} disabled={saving || loadingPrefs}>
            {saving ? "Saving..." : stepIndex === steps.length - 1 ? "Go To Dashboard" : "Continue"}
          </button>
        </div>
      </section>
    </div>
  );
}
