"use client";

import { FormEvent, useEffect, useState } from "react";

type PreferencesPayload = {
  keyword: string;
  llm_input_limit: number | "";
  max_bullets: number | "";
  remote_only: boolean;
  strict_senior_only: boolean;
};

type PreferencesResponse =
  | {
      ok: true;
      user?: { id: number; username: string; email_to: string; timezone: string | null };
      preferences: PreferencesPayload;
    }
  | { ok: false; error: string };

export default function PreferencesForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<PreferencesPayload>({
    keyword: "",
    llm_input_limit: "",
    max_bullets: "",
    remote_only: false,
    strict_senior_only: false
  });

  useEffect(() => {
    let active = true;

    async function loadPrefs() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/preferences", { method: "GET" });
        const data = (await response.json()) as PreferencesResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.ok ? "Failed to load preferences" : data.error);
        }
        if (!active) {
          return;
        }
        setForm(data.preferences);
      } catch (e) {
        if (!active) {
          return;
        }
        setError(e instanceof Error ? e.message : "Failed to load preferences");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPrefs();
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      const data = (await response.json()) as PreferencesResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? "Failed to save preferences" : data.error);
      }

      setForm(data.preferences);
      setSuccess("Preferences saved to PostgreSQL.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="footnote">Loading preferences...</p>;
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      {success ? <div className="banner ok">{success}</div> : null}
      {error ? <div className="banner err">{error}</div> : null}

      <label className="field">
        Keyword
        <input
          className="input"
          maxLength={120}
          placeholder="developer"
          value={form.keyword}
          onChange={(e) => setForm((prev) => ({ ...prev, keyword: e.target.value }))}
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
            value={form.llm_input_limit}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
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
            value={form.max_bullets}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                max_bullets: e.target.value === "" ? "" : Number(e.target.value)
              }))
            }
          />
        </label>
      </div>

      <label className="check-row">
        <input
          type="checkbox"
          checked={form.remote_only}
          onChange={(e) => setForm((prev) => ({ ...prev, remote_only: e.target.checked }))}
        />
        <span>Remote only</span>
      </label>

      <label className="check-row">
        <input
          type="checkbox"
          checked={form.strict_senior_only}
          onChange={(e) => setForm((prev) => ({ ...prev, strict_senior_only: e.target.checked }))}
        />
        <span>Strict senior only</span>
      </label>

      <button className="btn" type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save Preferences"}
      </button>
    </form>
  );
}
