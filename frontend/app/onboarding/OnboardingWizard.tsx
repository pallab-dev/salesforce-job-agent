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
  score_breakdown?: Record<string, number>;
  analysis: string[];
  suggestions: string[];
  recommended: {
    keyword: string;
    experience_level: string;
    target_roles: string[];
    tech_stack_tags: string[];
    negative_keywords: string[];
  };
  normalized_profile?: Record<string, unknown>;
  metadata?: {
    analysis_version?: string;
    scoring_version?: string;
    prompt_version?: string;
    model_provider?: string;
    model_name?: string;
    llm_used?: boolean;
    fallback_reason?: string | null;
  };
};

type ResumeAnalyzeApiResponse =
  | {
      ok: true;
      analysis: ResumeAnalysis;
      persistence?: {
        resume_version_id: number;
        resume_insight_id: number;
        profile_signal_id: number;
      };
    }
  | { ok: false; error: string };

const KNOWN_SKILLS = [
  "salesforce",
  "apex",
  "lwc",
  "lightning",
  "soql",
  "python",
  "django",
  "flask",
  "fastapi",
  "java",
  "spring",
  "javascript",
  "typescript",
  "react",
  "next.js",
  "node.js",
  "node",
  "express",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "aws",
  "gcp",
  "azure",
  "docker",
  "kubernetes",
  "terraform",
  "ci/cd",
  "github actions",
  "gitlab ci",
  "graphql",
  "rest",
  "microservices",
  "linux",
  "pandas",
  "numpy",
  "airflow"
] as const;

const ROLE_MATCHERS = [
  { role: "salesforce developer", terms: ["salesforce", "apex", "lwc", "lightning", "soql"] },
  { role: "backend engineer", terms: ["python", "java", "node", "api", "microservice", "postgresql"] },
  { role: "fullstack engineer", terms: ["react", "next.js", "node", "typescript", "javascript"] },
  { role: "data engineer", terms: ["airflow", "spark", "etl", "sql", "warehouse"] },
  { role: "devops engineer", terms: ["docker", "kubernetes", "terraform", "aws", "ci/cd"] }
] as const;

function includesTerm(text: string, term: string): boolean {
  return text.includes(term.toLowerCase());
}

function uniq(values: string[], limit = 999): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).slice(0, limit);
}

function inferExperienceLevel(text: string): string {
  const years = Array.from(text.matchAll(/(\d{1,2})\+?\s+years?/g))
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  const maxYears = years.length ? Math.max(...years) : 0;

  if (text.includes("principal") || text.includes("staff engineer")) {
    return "staff";
  }
  if (
    text.includes("senior") ||
    text.includes("lead developer") ||
    text.includes("tech lead") ||
    maxYears >= 6
  ) {
    return "senior";
  }
  if (maxYears >= 2) {
    return "mid";
  }
  if (maxYears > 0 || text.includes("intern") || text.includes("graduate")) {
    return "entry";
  }
  return "";
}

function analyzeResume(resumeText: string): ResumeAnalysis {
  const normalized = resumeText.toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);

  const extractedSkills = KNOWN_SKILLS.filter((skill) => includesTerm(normalized, skill)).map(String);
  const extractedKeywords = uniq(
    [
      ...extractedSkills,
      ...(normalized.includes("api") ? ["apis"] : []),
      ...(normalized.includes("testing") || normalized.includes("pytest") || normalized.includes("jest")
        ? ["testing"]
        : []),
      ...(normalized.includes("agile") ? ["agile"] : []),
      ...(normalized.includes("integration") ? ["integrations"] : [])
    ],
    14
  );

  const targetRoles = uniq(
    ROLE_MATCHERS.filter((matcher) => matcher.terms.filter((term) => includesTerm(normalized, term)).length >= 2).map(
      (matcher) => matcher.role
    ),
    4
  );

  if (targetRoles.length === 0) {
    if (normalized.includes("salesforce")) {
      targetRoles.push("salesforce developer");
    } else if (normalized.includes("react") || normalized.includes("frontend")) {
      targetRoles.push("fullstack engineer");
    } else {
      targetRoles.push("backend engineer");
    }
  }

  const techStackTags = uniq(
    extractedSkills
      .filter((skill) => !["ci/cd", "github actions", "gitlab ci", "rest"].includes(skill))
      .map((skill) => (skill === "node.js" ? "node" : skill)),
    10
  );

  const experienceLevel = inferExperienceLevel(normalized);
  const hasNumbers = /\b\d+(%|\+|x|k|m)?\b/i.test(resumeText);
  const hasProjects = /(project|projects)/i.test(resumeText);
  const hasSummary = /(summary|profile|objective)/i.test(resumeText);
  const hasSkillsSection = /\bskills\b/i.test(resumeText);
  const hasImpactVerbs = /(built|led|improved|designed|optimized|implemented|delivered)/i.test(resumeText);
  const hasContactSignals = /@|linkedin|github/i.test(resumeText);

  const scoreSignals = [
    words.length >= 120 ? 15 : 0,
    words.length <= 1200 ? 10 : 0,
    extractedKeywords.length >= 6 ? 20 : extractedKeywords.length >= 3 ? 10 : 0,
    hasSkillsSection ? 15 : 0,
    hasProjects ? 10 : 0,
    hasNumbers ? 15 : 0,
    hasImpactVerbs ? 10 : 0,
    hasContactSignals ? 5 : 0
  ];
  const score = Math.max(20, Math.min(100, scoreSignals.reduce((sum, n) => sum + n, 0)));

  const analysis: string[] = [];
  analysis.push(`Detected ${extractedKeywords.length} relevant keywords and ${techStackTags.length} stack tags.`);
  analysis.push(
    experienceLevel
      ? `Experience level looks like ${experienceLevel}.`
      : "Experience level is unclear from the resume text."
  );
  analysis.push(
    hasNumbers ? "Impact metrics are present, which improves screening quality." : "Impact metrics are missing or sparse."
  );
  if (!hasSkillsSection || !hasProjects || !hasSummary) {
    analysis.push(
      `Missing sections detected:${[
        !hasSummary ? " summary" : "",
        !hasSkillsSection ? " skills" : "",
        !hasProjects ? " projects" : ""
      ]
        .filter(Boolean)
        .join(",")}.`
    );
  }

  const suggestions: string[] = [];
  if (!hasSummary) suggestions.push("Add a short summary (3-4 lines) aligned to your target role.");
  if (!hasSkillsSection) suggestions.push("Add a dedicated skills section with exact technologies and platforms.");
  if (!hasProjects) suggestions.push("Add 1-2 project entries with stack, scope, and outcome.");
  if (!hasNumbers) suggestions.push("Add measurable impact (%, time saved, revenue, latency, throughput).");
  if (extractedKeywords.length < 5)
    suggestions.push("Use more role-specific keywords matching the jobs you want (e.g., Salesforce/Apex/LWC or backend APIs).");
  if (!hasImpactVerbs) suggestions.push("Start bullet points with action verbs like built, led, optimized, implemented.");
  if (suggestions.length === 0) {
    suggestions.push("Resume looks solid. Tailor keywords and role title wording for each application.");
  }

  const topTech = techStackTags.slice(0, 2);
  const primaryRole = targetRoles[0] ?? "backend engineer";
  const keyword = uniq([primaryRole, ...topTech]).join(", ");
  const negativeKeywords =
    experienceLevel === "entry" ? ["unpaid", "commission only"] : ["intern", "unpaid", "commission only"];

  return {
    extracted_keywords: extractedKeywords,
    score,
    analysis,
    suggestions: suggestions.slice(0, 6),
    recommended: {
      keyword,
      experience_level: experienceLevel,
      target_roles: targetRoles,
      tech_stack_tags: techStackTags,
      negative_keywords: uniq(negativeKeywords, 6)
    }
  };
}

const steps = ["Account", "Preferences", "Finish"] as const;

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
    negative_keywords: [],
    alert_frequency: "",
    primary_goal: ""
  });
  const [resumeText, setResumeText] = useState("");
  const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysis | null>(null);
  const [resumeRevealStep, setResumeRevealStep] = useState(0);
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

  function runResumeAnalysis() {
    void (async () => {
      setError("");
      setInfo("");
      const trimmed = resumeText.trim();
      if (!trimmed) {
        setError("Paste resume text first to generate keywords, score, and suggestions.");
        return;
      }
      if (trimmed.length < 80) {
        setError("Resume text is too short. Paste more of the resume for better analysis.");
        return;
      }

      setAnalyzingResume(true);
      try {
        const response = await fetch("/api/resume/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume_text: trimmed, source: "onboarding" })
        });
        const data = (await response.json()) as ResumeAnalyzeApiResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.ok ? "Failed to analyze resume" : data.error);
        }
        setResumeAnalysis(data.analysis);
        setResumeRevealStep(1);
        setInfo(
          data.analysis.metadata?.llm_used
            ? "Resume analyzed and saved. AI + rules generated scoring and recommendations."
            : "Resume analyzed and saved using fallback rules. Add GROQ_API_KEY for stronger AI analysis."
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to analyze resume");
      } finally {
        setAnalyzingResume(false);
      }
    })();
  }

  function applyResumeKeyword() {
    if (!resumeAnalysis) return;
    setPrefs((p) => ({ ...p, keyword: resumeAnalysis.recommended.keyword || p.keyword }));
    setInfo("Suggested keyword applied.");
  }

  function applyResumeSignals() {
    if (!resumeAnalysis) return;
    setPrefs((p) => ({
      ...p,
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
    setInfo("Resume-based profile signals applied.");
  }

  function revealNextResumeSection() {
    setResumeRevealStep((n) => Math.min(4, n + 1));
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
              <div className="resume-ai-card">
                <div className="prefs-section-head">
                  <h3>Resume Intelligence (paste resume text)</h3>
                  <p>We extract role keywords, score the resume, and suggest improvements you can apply one by one.</p>
                </div>
                <label className="field">
                  Resume text
                  <textarea
                    className="input resume-textarea"
                    rows={8}
                    placeholder="Paste your resume text here for onboarding analysis..."
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                  />
                </label>
                <div className="toolbar-row">
                  <button className="btn" type="button" onClick={runResumeAnalysis} disabled={loadingPrefs || saving || analyzingResume}>
                    {analyzingResume ? "Analyzing..." : "Analyze Resume"}
                  </button>
                  {resumeAnalysis ? (
                    <button className="btn btn-secondary" type="button" onClick={() => setResumeRevealStep(4)}>
                      Show All Insights
                    </button>
                  ) : null}
                </div>

                {resumeAnalysis ? (
                  <div className="workflow-lanes resume-workflow">
                    <div className="resume-sequence-head">
                      <span className="summary-label">Insight sequence</span>
                      <div className="toolbar-row">
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={revealNextResumeSection}
                          disabled={resumeRevealStep >= 4}
                        >
                          {resumeRevealStep >= 4 ? "All visible" : "Next insight"}
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={applyResumeKeyword}>
                          Apply keyword
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={applyResumeSignals}>
                          Apply profile signals
                        </button>
                      </div>
                    </div>

                    {resumeRevealStep >= 1 ? (
                      <div className="workflow-step">
                        <span className="step-index">1</span>
                        <div>
                          <strong>Specific keywords extracted</strong>
                          <div className="chip-row">
                            {resumeAnalysis.extracted_keywords.map((item) => (
                              <span key={item} className="resume-chip">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {resumeRevealStep >= 2 ? (
                      <div className="workflow-step">
                        <span className="step-index">2</span>
                        <div>
                          <strong>Resume score</strong>
                          <p className="resume-score-line">
                            <span className="resume-score-value">{resumeAnalysis.score}/100</span>
                            <span>
                              {resumeAnalysis.score >= 80
                                ? "Strong baseline for matching"
                                : resumeAnalysis.score >= 60
                                  ? "Good base, improve keyword alignment"
                                  : "Needs stronger structure and role-specific signals"}
                            </span>
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {resumeRevealStep >= 3 ? (
                      <div className="workflow-step">
                        <span className="step-index">3</span>
                        <div>
                          <strong>Analysis</strong>
                          <ul className="simple-list compact-list">
                            {resumeAnalysis.analysis.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : null}

                    {resumeRevealStep >= 4 ? (
                      <div className="workflow-step">
                        <span className="step-index">4</span>
                        <div>
                          <strong>Suggestions (apply one by one)</strong>
                          <ul className="simple-list compact-list">
                            {resumeAnalysis.suggestions.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                          <div className="resume-recommend-grid">
                            <p>
                              <strong>Suggested keyword:</strong> {resumeAnalysis.recommended.keyword || "-"}
                            </p>
                            <p>
                              <strong>Experience:</strong> {resumeAnalysis.recommended.experience_level || "-"}
                            </p>
                            <p>
                              <strong>Target roles:</strong>{" "}
                              {resumeAnalysis.recommended.target_roles.join(", ") || "-"}
                            </p>
                            <p>
                              <strong>Tech tags:</strong>{" "}
                              {resumeAnalysis.recommended.tech_stack_tags.join(", ") || "-"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
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
                Negative keywords (optional, comma-separated)
                <input
                  className="input"
                  placeholder="intern, unpaid, commission only"
                  value={prefs.negative_keywords.join(", ")}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      negative_keywords: e.target.value
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean)
                    }))
                  }
                />
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
          </div>
        ) : null}

        {stepIndex === 2 ? (
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
                <strong>Negative keywords:</strong> {prefs.negative_keywords.join(", ") || "-"}
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
