import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <header className="landing-topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="eyebrow">AI Job Agent</p>
            <p className="topbar-note">Personalized job-alert workflow for remote engineering roles</p>
          </div>
        </div>
        <div className="cta-row topbar-cta">
          <Link className="btn btn-link" href="/auth">
            Sign In / Sign Up Free
          </Link>
        </div>
      </header>

      <section className="landing-hero-doc">
        <div className="landing-copy hero-surface">
          <div className="hero-gridline" aria-hidden="true" />
          <p className="eyebrow">What It Does</p>
          <h1 className="landing-title">AI Job Agent finds relevant jobs and helps you manage alerts in one place.</h1>
          <p className="landing-subtitle">
            It fetches jobs from multiple sources, filters noisy results using rules and AI, and lets you control your
            preferences from a simple dashboard.
          </p>
          <div className="hero-bullets">
            <div className="hero-chip">Multi-source jobs</div>
            <div className="hero-chip">AI filtering</div>
            <div className="hero-chip">User preferences</div>
            <div className="hero-chip">Admin console</div>
          </div>
        </div>

        <aside className="landing-panel">
          <h2 className="section-title no-top">How It Works</h2>
          <div className="classic-flow">
            <div className="classic-step"><span>1</span>Create account / sign in</div>
            <div className="classic-arrow" aria-hidden="true">→</div>
            <div className="classic-step"><span>2</span>Set job preferences</div>
            <div className="classic-arrow" aria-hidden="true">→</div>
            <div className="classic-step"><span>3</span>AI filters job results</div>
            <div className="classic-arrow" aria-hidden="true">→</div>
            <div className="classic-step"><span>4</span>Get cleaner alerts</div>
          </div>
          <p className="muted-small">After login, users can update preferences anytime from the dashboard.</p>
        </aside>
      </section>

      <section className="landing-showcase simple-two-col">
        <div className="feature-card example-card">
          <h3>Example Result</h3>
          <pre className="example-block">{`- Senior Backend Engineer — ExampleCo — https://jobs.example.com/123
- Staff Software Engineer (Remote) — Acme — https://acme.io/jobs/456
- Full Stack Engineer — ProductX — https://productx.com/careers/789`}</pre>
          <p className="muted-small">
            Example of the final AI-filtered list a user may receive.
          </p>
        </div>

        <div className="feature-card">
          <h3>After Login (Dashboard)</h3>
          <ul className="simple-list">
            <li>View your username and Gmail</li>
            <li>Update keyword and filters</li>
            <li>Control result limits</li>
            <li>Admin users can open the admin console</li>
          </ul>
          <div className="cta-row">
            <Link className="btn btn-link" href="/auth">
              Sign In / Sign Up Free
            </Link>
            <Link className="btn btn-secondary btn-link" href="/dashboard">
              Go to Dashboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
