"use client";

import { FormEvent, useEffect, useState } from "react";
import MultiSelectChips from "../../components/MultiSelectChips";
import {
  NEGATIVE_KEYWORD_OPTIONS,
  TARGET_JOB_TITLE_OPTIONS,
  TARGET_ROLE_OPTIONS,
  TECH_STACK_OPTIONS
} from "../../lib/preference-options";

type PreferencesPayload = {
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

type PreferencesResponse =
  | {
      ok: true;
      user?: { id: number; username: string; email_to: string; timezone: string | null };
      preferences: PreferencesPayload;
    }
  | { ok: false; error: string };

const DEFAULT_FORM: PreferencesPayload = {
  keyword: "",
  llm_input_limit: 20,
  max_bullets: 8,
  remote_only: false,
  strict_senior_only: false,
  experience_level: "",
  target_roles: [],
  tech_stack_tags: [],
  negative_keywords: [],
  alert_frequency: "",
  primary_goal: ""
};

export default function PreferencesForm({ initialPreferences }: { initialPreferences?: PreferencesPayload }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<PreferencesPayload>(initialPreferences ?? DEFAULT_FORM);

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
        setForm({
          ...DEFAULT_FORM,
          ...data.preferences,
          llm_input_limit: data.preferences.llm_input_limit || 20,
          max_bullets: data.preferences.max_bullets || 8
        });
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

      setForm({
        ...DEFAULT_FORM,
        ...data.preferences,
        llm_input_limit: data.preferences.llm_input_limit || 20,
        max_bullets: data.preferences.max_bullets || 8
      });
      setSuccess("Preferences saved.");
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
          <p>Select the role title you want to prioritize in job matching.</p>
        </div>
        <label className="field">
          Job title focus
          <select
            className="input"
            value={form.keyword}
            onChange={(e) => setForm((prev) => ({ ...prev, keyword: e.target.value }))}
          >
            <option value="">Select...</option>
            {TARGET_JOB_TITLE_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Experience level
          <select
            className="input"
            value={form.experience_level}
            onChange={(e) => setForm((prev) => ({ ...prev, experience_level: e.target.value }))}
          >
            <option value="">Select...</option>
            <option value="entry">Entry</option>
            <option value="mid">Mid</option>
            <option value="senior">Senior</option>
            <option value="staff">Staff/Principal</option>
          </select>
        </label>
      </section>

      <section className="prefs-section-card">
        <div className="prefs-section-head">
          <h3>Filters</h3>
          <p>Use guided picklists for cleaner data and stronger matching quality.</p>
        </div>

        <MultiSelectChips
          label="Target roles"
          options={TARGET_ROLE_OPTIONS}
          selected={form.target_roles}
          onChange={(target_roles) => setForm((prev) => ({ ...prev, target_roles }))}
          placeholder="Search target role"
        />

        <MultiSelectChips
          label="Tech stack tags"
          options={TECH_STACK_OPTIONS}
          selected={form.tech_stack_tags}
          onChange={(tech_stack_tags) => setForm((prev) => ({ ...prev, tech_stack_tags }))}
          placeholder="Search tech stack"
        />

        <MultiSelectChips
          label="Exclude keywords"
          options={NEGATIVE_KEYWORD_OPTIONS}
          selected={form.negative_keywords}
          onChange={(negative_keywords) => setForm((prev) => ({ ...prev, negative_keywords }))}
          placeholder="Search exclusion keyword"
        />

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
              <strong>Senior priority</strong>
              <p>Reduce junior role noise and prioritize senior matches.</p>
            </div>
            <input
              type="checkbox"
              checked={form.strict_senior_only}
              onChange={(e) => setForm((prev) => ({ ...prev, strict_senior_only: e.target.checked }))}
            />
          </label>
        </div>
      </section>

      <section className="prefs-section-card">
        <div className="prefs-section-head">
          <h3>Alert Rhythm</h3>
          <p>Control update cadence and the main purpose of alerts.</p>
        </div>
        <div className="grid-two">
          <label className="field">
            Alert frequency
            <select
              className="input"
              value={form.alert_frequency}
              onChange={(e) => setForm((prev) => ({ ...prev, alert_frequency: e.target.value }))}
            >
              <option value="">Select...</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="high_priority_only">High priority only</option>
            </select>
          </label>

          <label className="field">
            Primary goal
            <select
              className="input"
              value={form.primary_goal}
              onChange={(e) => setForm((prev) => ({ ...prev, primary_goal: e.target.value }))}
            >
              <option value="">Select...</option>
              <option value="job_switch">Job switch</option>
              <option value="market_tracking">Market tracking</option>
              <option value="interview_pipeline">Interview pipeline</option>
            </select>
          </label>
        </div>
      </section>

      <div className="prefs-actions">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Preferences"}
        </button>
        <span className="footnote">LLM internals are hidden from this screen to keep setup simple.</span>
      </div>
    </form>
  );
}
