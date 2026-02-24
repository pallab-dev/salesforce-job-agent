import Link from "next/link";
import { cookies } from "next/headers";
import PreferencesForm from "./PreferencesForm";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const username = cookieStore.get("job_agent_username")?.value ?? "";
  const email = cookieStore.get("job_agent_email")?.value ?? "";

  return (
    <main className="page-shell">
      <section className="card" aria-labelledby="dash-title">
        <h1 id="dash-title" className="title">
          Dashboard
        </h1>
        <p className="subtitle">
          Simple dashboard using the prototype username/email login flow. User identity is read from cookies set after
          the DB upsert.
        </p>

        {username && email ? (
          <div className="banner ok">
            Logged in as <strong>{username}</strong> ({email})
          </div>
        ) : (
          <div className="banner err">
            No login session found yet. Submit the login form first.
          </div>
        )}

        <div className="stack">
          <div className="field">
            <span>Username</span>
            <input className="input" readOnly value={username || "-"} />
          </div>
          <div className="field">
            <span>Email</span>
            <input className="input" readOnly value={email || "-"} />
          </div>
        </div>

        {username && email ? (
          <>
            <h2 className="section-title">Preferences</h2>
            <p className="subtitle compact">
              These values are stored in <code>user_preferences</code> and override profile defaults.
            </p>
            <PreferencesForm />
          </>
        ) : null}

        <p className="footnote">
          OAuth is parked for later. We can re-enable Google login when you’re ready.
        </p>

        <p className="footnote">
          <Link href="/">Back to login</Link>
        </p>
      </section>
    </main>
  );
}
