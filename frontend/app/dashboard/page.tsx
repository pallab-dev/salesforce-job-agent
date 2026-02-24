import Link from "next/link";
import PreferencesForm from "./PreferencesForm";
import DashboardSessionActions from "./DashboardSessionActions";
import { getCurrentUserFromCookies, isAdminUser } from "../../lib/session";
import { getUserPreferences } from "../../lib/db";

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const tabParam = Array.isArray(params?.tab) ? params.tab[0] : params?.tab;
  const activeTab = tabParam === "preferences" ? "preferences" : "overview";
  const currentUser = await getCurrentUserFromCookies();
  const username = currentUser?.username ?? "";
  const email = currentUser?.email_to ?? "";
  const canAccessAdmin = isAdminUser(currentUser);
  const prefs = currentUser ? await getUserPreferences(currentUser.id) : null;
  const setupComplete = Boolean(
    prefs &&
      (prefs.keyword?.trim() || "") &&
      prefs.llm_input_limit &&
      prefs.max_bullets
  );
  const checklist = [
    { label: "Username", done: Boolean(username) },
    { label: "Gmail", done: Boolean(email) },
    { label: "Keyword", done: Boolean((prefs?.keyword || "").trim()) },
    { label: "LLM input limit", done: Boolean(prefs?.llm_input_limit) },
    { label: "Max bullets", done: Boolean(prefs?.max_bullets) },
    { label: "Remote preference", done: prefs?.remote_only !== null && prefs?.remote_only !== undefined },
    {
      label: "Seniority preference",
      done: prefs?.strict_senior_only !== null && prefs?.strict_senior_only !== undefined
    },
    {
      label: "Experience level",
      done:
        !!(
          prefs?.profile_overrides &&
          typeof prefs.profile_overrides["profile"] === "object" &&
          typeof (prefs.profile_overrides["profile"] as Record<string, unknown>)["experience_level"] === "string" &&
          ((prefs.profile_overrides["profile"] as Record<string, unknown>)["experience_level"] as string).trim()
        )
    },
    {
      label: "Target roles",
      done:
        !!(
          prefs?.profile_overrides &&
          typeof prefs.profile_overrides["profile"] === "object" &&
          Array.isArray((prefs.profile_overrides["profile"] as Record<string, unknown>)["target_roles"]) &&
          ((prefs.profile_overrides["profile"] as Record<string, unknown>)["target_roles"] as unknown[]).length > 0
        )
    },
    {
      label: "Tech stack tags",
      done:
        !!(
          prefs?.profile_overrides &&
          typeof prefs.profile_overrides["profile"] === "object" &&
          Array.isArray((prefs.profile_overrides["profile"] as Record<string, unknown>)["tech_stack_tags"]) &&
          ((prefs.profile_overrides["profile"] as Record<string, unknown>)["tech_stack_tags"] as unknown[]).length > 0
        )
    },
    {
      label: "Alert frequency",
      done:
        !!(
          prefs?.profile_overrides &&
          typeof prefs.profile_overrides["product"] === "object" &&
          typeof (prefs.profile_overrides["product"] as Record<string, unknown>)["alert_frequency"] === "string" &&
          ((prefs.profile_overrides["product"] as Record<string, unknown>)["alert_frequency"] as string).trim()
        )
    },
    {
      label: "Primary goal",
      done:
        !!(
          prefs?.profile_overrides &&
          typeof prefs.profile_overrides["product"] === "object" &&
          typeof (prefs.profile_overrides["product"] as Record<string, unknown>)["primary_goal"] === "string" &&
          ((prefs.profile_overrides["product"] as Record<string, unknown>)["primary_goal"] as string).trim()
        )
    }
  ];
  const completedCount = checklist.filter((item) => item.done).length;
  const completionPercent = Math.round((completedCount / checklist.length) * 100);
  const missingItems = checklist.filter((item) => !item.done).map((item) => item.label);
  const improvementEstimate =
    completionPercent >= 90
      ? { label: "High", detail: "Expected relevance improvement: high (best filtering quality)." }
      : completionPercent >= 65
        ? { label: "Medium", detail: "Expected relevance improvement: medium (good results, still tunable)." }
        : { label: "Low", detail: "Expected relevance improvement: low until setup is completed." };
  const onboardingMeta =
    prefs?.profile_overrides && typeof prefs.profile_overrides === "object"
      ? (prefs.profile_overrides["onboarding"] as Record<string, unknown> | undefined)
      : undefined;
  const onboardingCompletedAt =
    onboardingMeta && typeof onboardingMeta["completed_at"] === "string"
      ? onboardingMeta["completed_at"]
      : null;
  const rawLastCompletedStep = onboardingMeta ? onboardingMeta["last_completed_step"] : null;
  const lastCompletedStep =
    typeof rawLastCompletedStep === "number"
      ? rawLastCompletedStep
      : typeof rawLastCompletedStep === "string"
        ? Number(rawLastCompletedStep)
        : null;
  const resumeStepNumber =
    !onboardingCompletedAt && lastCompletedStep !== null && Number.isInteger(lastCompletedStep)
      ? Math.max(1, Math.min(3, lastCompletedStep + 2))
      : null;
  const profileMeta =
    prefs?.profile_overrides && typeof prefs.profile_overrides["profile"] === "object"
      ? (prefs.profile_overrides["profile"] as Record<string, unknown>)
      : {};
  const productMeta =
    prefs?.profile_overrides && typeof prefs.profile_overrides["product"] === "object"
      ? (prefs.profile_overrides["product"] as Record<string, unknown>)
      : {};
  const targetRoles = Array.isArray(profileMeta["target_roles"]) ? profileMeta["target_roles"].map(String) : [];
  const techTags = Array.isArray(profileMeta["tech_stack_tags"]) ? profileMeta["tech_stack_tags"].map(String) : [];
  const negativeKeywords = Array.isArray(profileMeta["negative_keywords"])
    ? profileMeta["negative_keywords"].map(String)
    : [];
  const experienceLevel = typeof profileMeta["experience_level"] === "string" ? profileMeta["experience_level"] : "";
  const alertFrequency = typeof productMeta["alert_frequency"] === "string" ? productMeta["alert_frequency"] : "";
  const primaryGoal = typeof productMeta["primary_goal"] === "string" ? productMeta["primary_goal"] : "";
  const recommendedNextAction = missingItems.includes("Keyword")
    ? { label: "Set your keyword", href: "/dashboard#preferences" }
    : missingItems.includes("LLM input limit") || missingItems.includes("Max bullets")
      ? { label: "Set result limits", href: "/dashboard#preferences" }
      : missingItems.includes("Experience level") || missingItems.includes("Target roles")
        ? {
            label: resumeStepNumber ? `Resume onboarding (Step ${resumeStepNumber})` : "Complete profile signals",
            href: "/onboarding"
          }
        : missingItems.includes("Alert frequency") || missingItems.includes("Primary goal")
          ? {
              label: resumeStepNumber ? `Resume onboarding (Step ${resumeStepNumber})` : "Complete product setup",
              href: "/onboarding"
            }
      : missingItems.length > 0
        ? {
            label: resumeStepNumber ? `Resume onboarding (Step ${resumeStepNumber})` : "Complete onboarding",
            href: "/onboarding"
          }
        : { label: "Review dashboard", href: "/dashboard#preferences" };

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar-v2" aria-label="Dashboard navigation">
        <div className="dash-brand">
          <div className="dash-brand-mark" aria-hidden="true" />
          <div>
            <p className="eyebrow">AI Job Agent</p>
            <p className="topbar-note">User Workspace</p>
          </div>
        </div>

        <nav className="dash-nav">
          <Link className={`dash-nav-item ${activeTab === "overview" ? "active" : ""}`} href="/dashboard?tab=overview">
            Overview
          </Link>
          <Link
            className={`dash-nav-item ${activeTab === "preferences" ? "active" : ""}`}
            href="/dashboard?tab=preferences"
          >
            Preferences
          </Link>
          {!setupComplete ? <a className="dash-nav-item" href="/onboarding">Continue Setup</a> : null}
          {canAccessAdmin ? <a className="dash-nav-item" href="/admin">Admin Console</a> : null}
        </nav>

        <DashboardSessionActions initialIsActive={currentUser?.is_active ?? true} />
      </aside>

      <section className="dashboard-main-v2" aria-labelledby="dash-title">
        <header className="dashboard-topbar">
          <div>
            <h1 id="dash-title" className="title">
              Dashboard
            </h1>
            <p className="subtitle compact">Summary + settings workspace for your alert workflow.</p>
          </div>
          <div className="dashboard-user-chip">
            <span className={`status-dot ${setupComplete ? "ok" : "warn"}`} />
            <div>
              <strong>{username || "Guest"}</strong>
              <small>{email || "No session"}</small>
            </div>
          </div>
        </header>

        {activeTab === "overview" ? (
        <section id="overview" className="dashboard-panel">
          {username && email ? (
            <div className={`dashboard-status ${setupComplete ? "ready" : "needs-setup"}`}>
              <div>
                <strong>{setupComplete ? "Setup complete" : "Setup incomplete"}</strong>
                <p>
                  {setupComplete
                    ? "Your preferences are configured. You can fine-tune them anytime below."
                    : "Complete your preferences to improve alert quality. Guided onboarding is available."}
                </p>
              </div>
              {!setupComplete ? (
                <Link className="btn btn-link" href="/onboarding">
                  {resumeStepNumber ? `Resume Onboarding (Step ${resumeStepNumber})` : "Continue Onboarding"}
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="banner err">No login session found yet. Submit the login form first.</div>
          )}

          <div className="dashboard-summary-grid">
            <div className="summary-card">
              <span className="summary-label">Username</span>
              <strong className="summary-value">{username || "-"}</strong>
              <p className="summary-help">Used for sign in and admin allowlist checks.</p>
            </div>
            <div className="summary-card">
              <span className="summary-label">Gmail</span>
              <strong className="summary-value">{email || "-"}</strong>
              <p className="summary-help">Prototype identity field (OAuth can replace later).</p>
            </div>
            <div className="summary-card">
              <span className="summary-label">Workflow Status</span>
              <strong className="summary-value">{setupComplete ? "Ready" : "Needs Setup"}</strong>
              <p className="summary-help">Based on saved preference completeness.</p>
            </div>
          </div>

          <div className="dashboard-summary-grid">
            <div className="summary-card">
              <span className="summary-label">Experience / Goal</span>
              <strong className="summary-value">
                {experienceLevel || "-"} {primaryGoal ? `· ${primaryGoal}` : ""}
              </strong>
              <p className="summary-help">Saved onboarding profile signals for personalization.</p>
            </div>
            <div className="summary-card">
              <span className="summary-label">Target Roles</span>
              <strong className="summary-value">{targetRoles.join(", ") || "-"}</strong>
              <p className="summary-help">Comma-separated roles collected during onboarding.</p>
            </div>
            <div className="summary-card">
              <span className="summary-label">Tech Stack / Frequency</span>
              <strong className="summary-value">
                {techTags.slice(0, 3).join(", ") || "-"} {alertFrequency ? `· ${alertFrequency}` : ""}
              </strong>
              <p className="summary-help">Used to improve future relevance and product tuning.</p>
            </div>
          </div>

          <div className="completion-card">
            <div className="completion-head">
              <div>
                <span className="summary-label">Profile Completion</span>
                <strong className="summary-value">{completionPercent}% complete</strong>
                <p className="summary-help">{improvementEstimate.detail}</p>
              </div>
              <div className={`completion-badge ${improvementEstimate.label.toLowerCase()}`}>
                {improvementEstimate.label} impact
              </div>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${completionPercent}%` }} />
            </div>
            {missingItems.length > 0 ? (
              <div className="missing-list-wrap">
                <span className="summary-label">Missing setup items</span>
                <ul className="simple-list compact-list">
                  {missingItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="completion-action-row">
                  <Link className="btn btn-link" href={recommendedNextAction.href}>
                    {recommendedNextAction.label}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="completion-success-wrap">
                <p className="summary-help">All key setup items are complete. Your alert workflow is fully configured.</p>
                {onboardingCompletedAt ? (
                  <p className="summary-help">
                    Onboarding completed: <code>{new Date(onboardingCompletedAt).toLocaleString()}</code>
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </section>
        ) : null}

        {username && email && activeTab === "preferences" ? (
          <section id="preferences" className="dashboard-panel">
            <div className="panel-head">
              <div>
                <h2 className="section-title no-top">Preferences</h2>
                <p className="subtitle compact">
                  Stored in <code>user_preferences</code>. This controls your job filtering workflow.
                </p>
              </div>
            </div>
            <PreferencesForm
              initialPreferences={{
                keyword: prefs?.keyword ?? "",
                llm_input_limit: prefs?.llm_input_limit ?? "",
                max_bullets: prefs?.max_bullets ?? "",
                remote_only: prefs?.remote_only ?? false,
                strict_senior_only: prefs?.strict_senior_only ?? false,
                negative_keywords: negativeKeywords
              }}
            />
          </section>
        ) : null}

        <footer className="dashboard-footer-links">
          <span className="footnote">OAuth is parked for later and can be re-enabled when ready.</span>
          <div className="dashboard-link-row">
            {canAccessAdmin ? <Link href="/admin">Open admin console</Link> : null}
            <Link href="/">Back to home</Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
