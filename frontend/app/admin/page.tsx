import Link from "next/link";
import AdminPanel from "./AdminPanel";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="card card-wide" aria-labelledby="admin-title">
        <h1 id="admin-title" className="title">
          Admin Console
        </h1>
        <p className="subtitle">
          Read-only operational view of DB records with user activate/deactivate controls.
        </p>

        <AdminPanel />

        <p className="footnote">
          Access is controlled by <code>ADMIN_EMAIL_ALLOWLIST</code> or <code>ADMIN_USERNAME_ALLOWLIST</code> in{" "}
          <code>frontend/.env.local</code>.
        </p>
        <p className="footnote">
          <Link href="/dashboard">Back to dashboard</Link>
        </p>
      </section>
    </main>
  );
}
