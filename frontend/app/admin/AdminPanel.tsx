"use client";

import { useEffect, useState } from "react";

type AdminOverview = {
  ok: true;
  admin: { username: string; email_to: string };
  data: {
    users: Array<{
      id: number;
      username: string;
      email_to: string;
      is_active: boolean;
      timezone: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>;
    userPreferences: Array<{
      user_id: number;
      username: string;
      keyword: string | null;
      llm_input_limit: number | null;
      max_bullets: number | null;
      remote_only: boolean | null;
      strict_senior_only: boolean | null;
      updated_at: string | null;
    }>;
    userState: Array<{
      user_id: number;
      username: string;
      last_run_at: string | null;
      last_email_sent_at: string | null;
      last_status: string | null;
      last_error: string | null;
      updated_at: string | null;
    }>;
    runLogs: Array<{
      id: number;
      username: string | null;
      run_type: string;
      status: string;
      fetched_jobs_count: number | null;
      keyword_jobs_count: number | null;
      emailed_jobs_count: number | null;
      error_message: string | null;
      started_at: string | null;
      finished_at: string | null;
    }>;
  };
};

type AdminError = { ok: false; error: string };

function fmt(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

export default function AdminPanel() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AdminOverview | null>(null);

  async function loadOverview(withSpinner = true) {
    if (withSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError("");

    try {
      const response = await fetch("/api/admin/overview");
      const payload = (await response.json()) as AdminOverview | AdminError;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to load admin data" : payload.error);
      }
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadOverview(true);
  }, []);

  async function onToggle(username: string, nextValue: boolean) {
    setError("");
    try {
      const response = await fetch("/api/admin/users/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, is_active: nextValue })
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to update user");
      }
      await loadOverview(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    }
  }

  if (loading) {
    return <p className="footnote">Loading admin data...</p>;
  }

  if (error && !data) {
    return <div className="banner err">{error}</div>;
  }

  if (!data) {
    return <div className="banner err">No data available.</div>;
  }

  return (
    <div className="stack">
      <div className="banner ok">
        Admin: <strong>{data.admin.username}</strong> ({data.admin.email_to})
      </div>
      {error ? <div className="banner err">{error}</div> : null}

      <div className="toolbar-row">
        <button className="btn" type="button" onClick={() => loadOverview(false)} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <h2 className="section-title">Users</h2>
      <AdminTable
        headers={["Username", "Email", "Active", "Timezone", "Updated", "Action"]}
        rows={data.data.users.map((u) => [
          u.username,
          u.email_to,
          u.is_active ? "Yes" : "No",
          fmt(u.timezone),
          fmt(u.updated_at),
          <button
            key={`${u.username}-toggle`}
            type="button"
            className={u.is_active ? "btn btn-danger" : "btn btn-secondary"}
            onClick={() => onToggle(u.username, !u.is_active)}
          >
            {u.is_active ? "Deactivate" : "Activate"}
          </button>
        ])}
      />

      <h2 className="section-title">User Preferences</h2>
      <AdminTable
        headers={["Username", "Keyword", "LLM Limit", "Max Bullets", "Remote Only", "Strict Senior", "Updated"]}
        rows={data.data.userPreferences.map((p) => [
          p.username,
          fmt(p.keyword),
          fmt(p.llm_input_limit),
          fmt(p.max_bullets),
          fmt(p.remote_only),
          fmt(p.strict_senior_only),
          fmt(p.updated_at)
        ])}
      />

      <h2 className="section-title">User State</h2>
      <AdminTable
        headers={["Username", "Last Status", "Last Run", "Last Email", "Last Error", "Updated"]}
        rows={data.data.userState.map((s) => [
          s.username,
          fmt(s.last_status),
          fmt(s.last_run_at),
          fmt(s.last_email_sent_at),
          fmt(s.last_error),
          fmt(s.updated_at)
        ])}
      />

      <h2 className="section-title">Recent Run Logs</h2>
      <AdminTable
        headers={["ID", "User", "Type", "Status", "Fetched", "Keyword", "Emailed", "Started", "Error"]}
        rows={data.data.runLogs.map((r) => [
          r.id,
          fmt(r.username),
          r.run_type,
          r.status,
          fmt(r.fetched_jobs_count),
          fmt(r.keyword_jobs_count),
          fmt(r.emailed_jobs_count),
          fmt(r.started_at),
          fmt(r.error_message)
        ])}
      />
    </div>
  );
}

function AdminTable({
  headers,
  rows
}: {
  headers: string[];
  rows: Array<Array<string | number | JSX.Element>>;
}) {
  return (
    <div className="table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="empty-cell">
                No records found.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
