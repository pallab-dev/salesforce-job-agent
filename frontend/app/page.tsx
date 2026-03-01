import Link from "next/link";

const flowSteps = [
  { title: "Verify", detail: "Sign in with Gmail OTP verification" },
  { title: "Configure", detail: "Pick target roles and stack using guided selectors" },
  { title: "Upload", detail: "Upload resume and auto-fill profile signals" },
  { title: "Track", detail: "Get cleaner alerts and iterate from dashboard" }
] as const;

export default function HomePage() {
  return (
    <main className="landing-shell modern-landing">
      <header className="landing-topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="eyebrow">AI Job Agent</p>
            <p className="topbar-note">Cleaner remote job discovery with guided onboarding</p>
          </div>
        </div>
        <div className="cta-row topbar-cta">
          <Link className="btn btn-link" href="/auth">
            Start Free
          </Link>
        </div>
      </header>

      <section className="landing-hero-doc">
        <div className="landing-copy hero-surface">
          <div className="hero-gridline" aria-hidden="true" />
          <p className="eyebrow">Modern Job Workflow</p>
          <h1 className="landing-title">One flow from Gmail verification to relevant job alerts.</h1>
          <p className="landing-subtitle">
            No confusing technical fields. Use guided role/tech selectors, resume intelligence, and a clean dashboard to keep
            your search focused.
          </p>
          <div className="hero-bullets">
            <div className="hero-chip">OTP login</div>
            <div className="hero-chip">Resume upload</div>
            <div className="hero-chip">Smart picklists</div>
            <div className="hero-chip">Simple dashboard</div>
          </div>
          <div className="cta-row">
            <Link className="btn btn-link" href="/auth">
              Create Account
            </Link>
            <Link className="btn btn-secondary btn-link" href="/dashboard">
              Open Dashboard
            </Link>
          </div>
        </div>

        <aside className="landing-panel">
          <h2 className="section-title no-top">Dynamic Setup Flow</h2>
          <div className="dynamic-flow-grid" role="list" aria-label="Setup flow">
            {flowSteps.map((step, idx) => (
              <div key={step.title} className="dynamic-flow-step" role="listitem">
                <span>{idx + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="muted-small">Every step is editable later. Onboarding progress is auto-saved.</p>
        </aside>
      </section>

      <section className="landing-showcase simple-two-col">
        <div className="feature-card example-card">
          <h3>What Users See</h3>
          <ul className="simple-list">
            <li>Step-based onboarding with progress flow</li>
            <li>Resume upload + recommendation apply</li>
            <li>Role and stack picklists with validation</li>
            <li>No raw LLM input/output confusion</li>
          </ul>
        </div>

        <div className="feature-card">
          <h3>What Improves</h3>
          <ul className="simple-list">
            <li>Lower onboarding drop-off</li>
            <li>More consistent preference data</li>
            <li>Clearer dashboard actions</li>
            <li>Safer account access with OTP</li>
          </ul>
          <div className="cta-row">
            <Link className="btn btn-link" href="/auth">
              Start with OTP
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
