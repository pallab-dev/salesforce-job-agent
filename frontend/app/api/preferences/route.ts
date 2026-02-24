import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserByUsername, getUserPreferences, upsertUserPreferences } from "../../../lib/db";

export const runtime = "nodejs";

type PrefsPayload = {
  keyword?: unknown;
  llm_input_limit?: unknown;
  max_bullets?: unknown;
  remote_only?: unknown;
  strict_senior_only?: unknown;
  experience_level?: unknown;
  target_roles?: unknown;
  tech_stack_tags?: unknown;
  alert_frequency?: unknown;
  primary_goal?: unknown;
};

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function parseOptionalInt(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return n;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new Error(`${field} must be boolean`);
}

function parseStringArray(value: unknown, field: string): string[] {
  if (value === null || value === undefined || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  throw new Error(`${field} must be a string or array of strings`);
}

function extractProfileOverrides(prefs: Awaited<ReturnType<typeof getUserPreferences>>): Record<string, unknown> {
  const root = (prefs?.profile_overrides && typeof prefs.profile_overrides === "object" ? prefs.profile_overrides : {}) as Record<
    string,
    unknown
  >;
  return { ...root };
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

async function resolveSessionUser() {
  const cookieStore = await cookies();
  const username = cookieStore.get("job_agent_username")?.value?.trim() ?? "";
  const email = cookieStore.get("job_agent_email")?.value?.trim() ?? "";
  if (!username || !email) {
    return null;
  }

  const user = await getUserByUsername(username);
  if (!user || user.email_to !== email) {
    return null;
  }
  return user;
}

export async function GET() {
  try {
    const user = await resolveSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const prefs = await getUserPreferences(user.id);
    const root = extractProfileOverrides(prefs);
    const profile = (root.profile && typeof root.profile === "object" ? root.profile : {}) as Record<string, unknown>;
    const product = (root.product && typeof root.product === "object" ? root.product : {}) as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email_to: user.email_to,
        timezone: user.timezone
      },
      preferences: {
        keyword: prefs?.keyword ?? "",
        llm_input_limit: prefs?.llm_input_limit ?? "",
        max_bullets: prefs?.max_bullets ?? "",
        remote_only: prefs?.remote_only ?? false,
        strict_senior_only: prefs?.strict_senior_only ?? false,
        experience_level: typeof profile.experience_level === "string" ? profile.experience_level : "",
        target_roles: Array.isArray(profile.target_roles)
          ? profile.target_roles.map((v) => String(v))
          : [],
        tech_stack_tags: Array.isArray(profile.tech_stack_tags)
          ? profile.tech_stack_tags.map((v) => String(v))
          : [],
        alert_frequency: typeof product.alert_frequency === "string" ? product.alert_frequency : "",
        primary_goal: typeof product.primary_goal === "string" ? product.primary_goal : ""
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load preferences";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await resolveSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: PrefsPayload;
    try {
      body = (await request.json()) as PrefsPayload;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const existingPrefs = await getUserPreferences(user.id);
    const mergedRoot = extractProfileOverrides(existingPrefs);
    const existingProfile =
      (mergedRoot.profile && typeof mergedRoot.profile === "object" ? mergedRoot.profile : {}) as Record<string, unknown>;
    const existingProduct =
      (mergedRoot.product && typeof mergedRoot.product === "object" ? mergedRoot.product : {}) as Record<string, unknown>;

    const nextProfile = {
      ...existingProfile,
      ...(hasOwn(body, "experience_level")
        ? { experience_level: parseOptionalString(body.experience_level) }
        : {}),
      ...(hasOwn(body, "target_roles") ? { target_roles: parseStringArray(body.target_roles, "target_roles") } : {}),
      ...(hasOwn(body, "tech_stack_tags")
        ? { tech_stack_tags: parseStringArray(body.tech_stack_tags, "tech_stack_tags") }
        : {})
    };
    const nextProduct = {
      ...existingProduct,
      ...(hasOwn(body, "alert_frequency")
        ? { alert_frequency: parseOptionalString(body.alert_frequency) }
        : {}),
      ...(hasOwn(body, "primary_goal") ? { primary_goal: parseOptionalString(body.primary_goal) } : {})
    };

    const saved = await upsertUserPreferences({
      userId: user.id,
      keyword: parseOptionalString(body.keyword),
      llmInputLimit: parseOptionalInt(body.llm_input_limit, "llm_input_limit"),
      maxBullets: parseOptionalInt(body.max_bullets, "max_bullets"),
      remoteOnly: parseBoolean(body.remote_only, "remote_only"),
      strictSeniorOnly: parseBoolean(body.strict_senior_only, "strict_senior_only"),
      profileOverrides: {
        ...mergedRoot,
        profile: nextProfile,
        product: nextProduct
      }
    });

    const savedRoot = extractProfileOverrides(saved);
    const savedProfile =
      (savedRoot.profile && typeof savedRoot.profile === "object" ? savedRoot.profile : {}) as Record<string, unknown>;
    const savedProduct =
      (savedRoot.product && typeof savedRoot.product === "object" ? savedRoot.product : {}) as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      preferences: {
        keyword: saved.keyword ?? "",
        llm_input_limit: saved.llm_input_limit ?? "",
        max_bullets: saved.max_bullets ?? "",
        remote_only: saved.remote_only ?? false,
        strict_senior_only: saved.strict_senior_only ?? false,
        experience_level: typeof savedProfile.experience_level === "string" ? savedProfile.experience_level : "",
        target_roles: Array.isArray(savedProfile.target_roles)
          ? savedProfile.target_roles.map((v) => String(v))
          : [],
        tech_stack_tags: Array.isArray(savedProfile.tech_stack_tags)
          ? savedProfile.tech_stack_tags.map((v) => String(v))
          : [],
        alert_frequency: typeof savedProduct.alert_frequency === "string" ? savedProduct.alert_frequency : "",
        primary_goal: typeof savedProduct.primary_goal === "string" ? savedProduct.primary_goal : ""
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save preferences";
    const status = message.includes("must be") ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
