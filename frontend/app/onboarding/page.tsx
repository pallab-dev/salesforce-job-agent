import Link from "next/link";
import { getCurrentUserFromCookies } from "../../lib/session";
import { getUserPreferences } from "../../lib/db";
import OnboardingWizard from "./OnboardingWizard";

export default async function OnboardingPage() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return (
      <main className="page-shell">
        <section className="card" aria-labelledby="onboarding-auth-needed">
          <h1 id="onboarding-auth-needed" className="title">
            Sign in required
          </h1>
          <p className="subtitle">Please sign in first to continue the onboarding workflow.</p>
          <Link className="btn btn-link" href="/auth">
            Go to Sign In / Sign Up
          </Link>
        </section>
      </main>
    );
  }

  const prefs = await getUserPreferences(user.id);
  const onboardingMeta =
    prefs?.profile_overrides && typeof prefs.profile_overrides["onboarding"] === "object"
      ? (prefs.profile_overrides["onboarding"] as Record<string, unknown>)
      : {};
  const completed = Boolean(onboardingMeta["completed"]);
  const lastCompletedStep =
    typeof onboardingMeta["last_completed_step"] === "number"
      ? onboardingMeta["last_completed_step"]
      : typeof onboardingMeta["last_completed_step"] === "string"
        ? Number(onboardingMeta["last_completed_step"])
        : -1;
  const initialStep = completed
    ? 2
    : Number.isInteger(lastCompletedStep)
      ? Math.max(0, Math.min(2, lastCompletedStep + 1))
      : 0;

  return (
    <main className="page-shell onboarding-page">
      <section className="card onboarding-warning-card" aria-labelledby="onboarding-warning">
        <h2 id="onboarding-warning" className="section-title no-top">
          Complete setup for better job matching
        </h2>
        <p className="subtitle compact">
          This guided flow captures role focus, stack preferences, and resume insights. You can still update everything
          later from the dashboard.
        </p>
        {initialStep > 0 && !completed ? (
          <p className="footnote">
            Resuming from Step {initialStep + 1} based on your saved onboarding progress.
          </p>
        ) : null}
      </section>
      <OnboardingWizard user={{ username: user.username, email: user.email_to }} initialStep={initialStep} />
    </main>
  );
}
