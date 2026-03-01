"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MultiSelectChips from "../../components/MultiSelectChips";
import {
  NEGATIVE_KEYWORD_OPTIONS,
  TARGET_JOB_TITLE_OPTIONS,
  TARGET_ROLE_OPTIONS,
  TECH_STACK_OPTIONS
} from "../../lib/preference-options";

type PrefsState = {
  keyword: string;
  llm_input_limit: number | "";
  max_bullets: number | "";
  remote_only: boolean;
  strict_senior_only: boolean;
  experience_level: string;
  target_roles: string[];
  tech_stack_tags: string[];
  negative_keywords: string[];
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

type ResumeAnalysis = {
  extracted_keywords: string[];
  score: number;
  analysis: string[];
  suggestions: string[];
  recommended: {
    keyword: string;
    experience_level: string;
    target_roles: string[];
    tech_stack_tags: string[];
    negative_keywords: string[];
  };
};

type ResumeAnalyzeApiResponse =
  | {
      ok: true;
      analysis: ResumeAnalysis;
    }
  | { ok: false; error: string };

const steps = ["Profile", "Preferences", "Finish"] as const;

const DEFAULT_PREFS: PrefsState = {
  keyword: "",
  llm_input_limit: 20,
  max_bullets: 8,
  remote_only: false,
  strict_senior_only: false,
  experience_level: "",
  target_roles: [],
  tech_stack_tags: [],
  negative_keywords: [],
  alert_frequency: "",
  primary_goal: ""
};

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
  const [prefs, setPrefs] = useState<PrefsState>(DEFAULT_PREFS);
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysis | null>(null);
  const [analyzingResume, setAnalyzingResume] = useState(false);

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
        setPrefs({
          ...DEFAULT_PREFS,
          ...data.preferences,
          llm_input_limit: data.preferences.llm_input_limit || 20,
          max_bullets: data.preferences.max_bullets || 8
        });
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
      { label: "Job title focus", done: Boolean((prefs.keyword || "").trim()) },
      { label: "Experience level", done: Boolean(prefs.experience_level) },
      { label: "Target roles", done: prefs.target_roles.length > 0 },
      { label: "Tech stack", done: prefs.tech_stack_tags.length > 0 },
      { label: "Alert frequency", done: Boolean(prefs.alert_frequency) },
      { label: "Primary goal", done: Boolean(prefs.primary_goal) }
    ],
    [prefs]
  );
  const onboardingCompletion = Math.round(
    (completionChecklist.filter((item) => item.done).length / completionChecklist.length) * 100
  );
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
      setPrefs((prev) => ({
        ...prev,
        ...data.preferences,
        llm_input_limit: prev.llm_input_limit || 20,
        max_bullets: prev.max_bullets || 8
      }));
      setInfo("Progress saved.");
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
      // non-blocking
    }
  }

  async function onNext() {
    setError("");
    setInfo("");

    if (stepIndex <= 1) {
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
      // non-blocking
    }
    router.push("/dashboard");
  }

  function onBack() {
    setError("");
    setInfo("");
    setStepIndex((s) => Math.max(0, s - 1));
  }

  function onResumeFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setResumeFile(file);
  }

  function runResumeAnalysis() {
    void (async () => {
      setError("");
      setInfo("");
      if (!resumeFile && !resumeText.trim()) {
        setError("Upload a resume (.pdf/.txt) or paste resume text first.");
        return;
      }

      setAnalyzingResume(true);
      try {
        const response = resumeFile
          ? await fetch("/api/resume/analyze", {
              method: "POST",
              body: (() => {
                const form = new FormData();
                form.append("resume_file", resumeFile);
                form.append("source", "onboarding_upload");
                return form;
              })()
            })
          : await fetch("/api/resume/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ resume_text: resumeText.trim(), source: "onboarding" })
            });

        const data = (await response.json()) as ResumeAnalyzeApiResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.ok ? "Failed to analyze resume" : data.error);
        }
        setResumeAnalysis(data.analysis);
        setInfo("Resume analyzed. Apply recommendations to auto-fill your profile.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to analyze resume");
      } finally {
        setAnalyzingResume(false);
      }
    })();
  }

  function applyResumeRecommendations() {
    if (!resumeAnalysis) return;
    setPrefs((p) => ({
      ...p,
      keyword: resumeAnalysis.recommended.keyword || p.keyword,
      experience_level: resumeAnalysis.recommended.experience_level || p.experience_level,
      target_roles: resumeAnalysis.recommended.target_roles.length
        ? resumeAnalysis.recommended.target_roles
        : p.target_roles,
      tech_stack_tags: resumeAnalysis.recommended.tech_stack_tags.length
        ? resumeAnalysis.recommended.tech_stack_tags
        : p.tech_stack_tags,
      negative_keywords: resumeAnalysis.recommended.negative_keywords.length
        ? resumeAnalysis.recommended.negative_keywords
        : p.negative_keywords
    }));
    setInfo("Resume recommendations applied.");
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-header">
        <div>
          <p className="eyebrow">Guided Setup</p>
          <h1 className="title onboarding-title">Set up your alert flow in minutes</h1>
          <p className="subtitle">Follow the step flow. You can edit everything later from dashboard settings.</p>
        </div>
        <Link className="btn btn-secondary btn-link" href="/dashboard">
          Skip to Dashboard
        </Link>
      </div>

      <div className="onboarding-progress-card">
        <div className="flow-diagram">
          {steps.map((step, idx) => (
            <div key={step} className={`flow-node ${idx < stepIndex ? "done" : ""} ${idx === stepIndex ? "active" : ""}`}>
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
          <span className="summary-label">Setup completion</span>
          <strong className="summary-value">{onboardingCompletion}%</strong>
        </div>
        {onboardingMissing.length > 0 ? (
          <div className="onboarding-missing-mini">
            <span className="summary-label">Still missing</span>
            <ul className="simple-list compact-list">
              {onboardingMissing.slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="completion-badge high">Ready for job alerts</div>
        )}
      </div>

      {info ? <div className="banner ok">{info}</div> : null}
      {error ? <div className="banner err">{error}</div> : null}

      <section className="card onboarding-card">
        {stepIndex === 0 ? (
          <div className="stack">
            <h2 className="section-title no-top">Profile Basics</h2>
            <p className="subtitle compact">Choose your role focus and optionally upload resume for auto-suggestions.</p>

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

            <label className="field">
              Upload resume (.pdf or .txt)
              <input className="input" type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={onResumeFileChange} />
            </label>

            <label className="field">
              Or paste resume text
              <textarea
                className="input resume-textarea"
                rows={6}
                placeholder="Paste resume text here if you don't want file upload..."
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
              />
            </label>

            <div className="toolbar-row">
              <button className="btn" type="button" onClick={runResumeAnalysis} disabled={loadingPrefs || saving || analyzingResume}>
                {analyzingResume ? "Analyzing..." : "Analyze Resume"}
              </button>
              {resumeFile ? <span className="footnote">Selected file: {resumeFile.name}</span> : null}
            </div>

            {resumeAnalysis ? (
              <div className="workflow-lanes">
                <div className="workflow-step">
                  <span className="step-index">1</span>
                  <div>
                    <strong>Detected skills</strong>
                    <div className="chip-row">
                      {resumeAnalysis.extracted_keywords.slice(0, 12).map((item) => (
                        <span key={item} className="resume-chip">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="workflow-step">
                  <span className="step-index">2</span>
                  <div>
                    <strong>Resume score: {resumeAnalysis.score}/100</strong>
                    <ul className="simple-list compact-list">
                      {resumeAnalysis.suggestions.slice(0, 4).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="workflow-step">
                  <span className="step-index">3</span>
                  <div>
                    <strong>Apply smart recommendations</strong>
                    <p className="summary-help">This fills your role focus, target roles, stack tags, and negative keywords.</p>
                    <button className="btn btn-secondary" type="button" onClick={applyResumeRecommendations}>
                      Apply Recommendations
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <label className="field">
              Job title focus
              <select
                className="input"
                value={prefs.keyword}
                onChange={(e) => setPrefs((p) => ({ ...p, keyword: e.target.value }))}
              >
                <option value="">Select...</option>
                {TARGET_JOB_TITLE_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

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
          </div>
        ) : null}

        {stepIndex === 1 ? (
          <div className="stack">
            <h2 className="section-title no-top">Alert Preferences</h2>
            <p className="subtitle compact">Choose role/tech filters using guided picklists.</p>

            <div className="toggle-grid">
              <label className="toggle-card">
                <div>
                  <strong>Remote only</strong>
                  <p>Prefer fully remote opportunities.</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.remote_only}
                  onChange={(e) => setPrefs((prev) => ({ ...prev, remote_only: e.target.checked }))}
                />
              </label>

              <label className="toggle-card">
                <div>
                  <strong>Senior priority</strong>
                  <p>Reduce junior role noise.</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.strict_senior_only}
                  onChange={(e) => setPrefs((prev) => ({ ...prev, strict_senior_only: e.target.checked }))}
                />
              </label>
            </div>

            <div className="grid-two">
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

            <MultiSelectChips
              label="Target roles"
              options={TARGET_ROLE_OPTIONS}
              selected={prefs.target_roles}
              onChange={(target_roles) => setPrefs((p) => ({ ...p, target_roles }))}
              placeholder="Search target role"
            />

            <MultiSelectChips
              label="Tech stack tags"
              options={TECH_STACK_OPTIONS}
              selected={prefs.tech_stack_tags}
              onChange={(tech_stack_tags) => setPrefs((p) => ({ ...p, tech_stack_tags }))}
              placeholder="Search tech stack"
            />

            <MultiSelectChips
              label="Exclude keywords"
              options={NEGATIVE_KEYWORD_OPTIONS}
              selected={prefs.negative_keywords}
              onChange={(negative_keywords) => setPrefs((p) => ({ ...p, negative_keywords }))}
              placeholder="Search exclusion keyword"
              helperText="These words are filtered out before final ranking."
            />
          </div>
        ) : null}

        {stepIndex === 2 ? (
          <div className="stack">
            <h2 className="section-title no-top">Review and Finish</h2>
            <p className="subtitle compact">Your setup is ready. Confirm and continue to dashboard.</p>
            <div className="feature-card finish-summary">
              <h3>Current setup summary</h3>
              <p>
                <strong>User:</strong> {user.username} ({user.email})
              </p>
              <p>
                <strong>Job title focus:</strong> {prefs.keyword || "-"}
              </p>
              <p>
                <strong>Experience:</strong> {prefs.experience_level || "-"}
              </p>
              <p>
                <strong>Target roles:</strong> {prefs.target_roles.join(", ") || "-"}
              </p>
              <p>
                <strong>Tech stack:</strong> {prefs.tech_stack_tags.join(", ") || "-"}
              </p>
              <p>
                <strong>Exclude:</strong> {prefs.negative_keywords.join(", ") || "-"}
              </p>
              <p>
                <strong>Frequency:</strong> {prefs.alert_frequency || "-"} | <strong>Goal:</strong> {prefs.primary_goal || "-"}
              </p>
            </div>
          </div>
        ) : null}

        <div className="onboarding-actions">
          <button className="btn btn-secondary" type="button" onClick={onBack} disabled={stepIndex === 0 || saving}>
            Back
          </button>
          <button className="btn" type="button" onClick={onNext} disabled={saving || loadingPrefs}>
            {saving ? "Saving..." : stepIndex === steps.length - 1 ? "Finish Setup" : "Save & Continue"}
          </button>
        </div>
      </section>
    </div>
  );
}
