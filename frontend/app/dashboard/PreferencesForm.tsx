"use client";

import { FormEvent, useEffect, useState } from "react";

type PreferencesPayload = {
  keyword: string;
  llm_input_limit: number | "";
  max_bullets: number | "";
  remote_only: boolean;
  strict_senior_only: boolean;
  negative_keywords: string[];
};

type PreferencesResponse =
  | {
      ok: true;
      user?: { id: number; username: string; email_to: string; timezone: string | null };
      preferences: PreferencesPayload;
    }
  | { ok: false; error: string };

export default function PreferencesForm({ initialPreferences }: { initialPreferences?: PreferencesPayload }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<PreferencesPayload>(
    initialPreferences ?? {
      keyword: "",
      llm_input_limit: "",
      max_bullets: "",
      remote_only: false,
      strict_senior_only: false,
      negative_keywords: []
    }
  );

  useEffect(() => {
    if (initialPreferences) {
      setLoading(false);
      return;
    }

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
  }, [initialPreferences]);

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
    <form className="prefs-form" onSubmit={onSubmit}>
      {success ? <div className="banner ok">{success}</div> : null}
      {error ? <div className="banner err">{error}</div> : null}

      <section className="prefs-section-card">
        <div className="prefs-section-head">
          <h3>Search Focus</h3>
          <p>Define the primary keyword used for filtering jobs before AI ranking.</p>
        </div>
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
      </section>

      <section className="prefs-section-card">
        <div className="prefs-section-head">
          <h3>Limits</h3>
          <p>Control how many jobs enter the AI filter and how many bullets appear in results.</p>
        </div>
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
      </section>

      <section className="prefs-section-card">
        <div className="prefs-section-head">
          <h3>Filters</h3>
          <p>Choose strictness for remote roles and seniority matching.</p>
        </div>
        <label className="field">
          Negative keywords (optional)
          <input
            className="input"
            maxLength={300}
            placeholder="qa, recruiter, support, sales"
            value={form.negative_keywords.join(", ")}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                negative_keywords: e.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
              }))
            }
          />
        </label>
        <div className="toggle-grid">
          <label className="toggle-card">
            <div>
              <strong>Remote only</strong>
              <p>Prefer strictly remote roles in your filtered results.</p>
            </div>
            <input
              type="checkbox"
              checked={form.remote_only}
              onChange={(e) => setForm((prev) => ({ ...prev, remote_only: e.target.checked }))}
            />
          </label>

          <label className="toggle-card">
            <div>
              <strong>Strict senior only</strong>
              <p>Reduce junior or broad matches and focus on senior roles.</p>
            </div>
            <input
              type="checkbox"
              checked={form.strict_senior_only}
              onChange={(e) => setForm((prev) => ({ ...prev, strict_senior_only: e.target.checked }))}
            />
          </label>
        </div>
      </section>

      <div className="prefs-actions">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Preferences"}
        </button>
        <span className="footnote">Changes are saved to PostgreSQL immediately when you click save.</span>
      </div>
    </form>
  );
}
