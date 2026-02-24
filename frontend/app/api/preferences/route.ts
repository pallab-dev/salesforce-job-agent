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
        strict_senior_only: prefs?.strict_senior_only ?? false
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

    const saved = await upsertUserPreferences({
      userId: user.id,
      keyword: parseOptionalString(body.keyword),
      llmInputLimit: parseOptionalInt(body.llm_input_limit, "llm_input_limit"),
      maxBullets: parseOptionalInt(body.max_bullets, "max_bullets"),
      remoteOnly: parseBoolean(body.remote_only, "remote_only"),
      strictSeniorOnly: parseBoolean(body.strict_senior_only, "strict_senior_only")
    });

    return NextResponse.json({
      ok: true,
      preferences: {
        keyword: saved.keyword ?? "",
        llm_input_limit: saved.llm_input_limit ?? "",
        max_bullets: saved.max_bullets ?? "",
        remote_only: saved.remote_only ?? false,
        strict_senior_only: saved.strict_senior_only ?? false
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save preferences";
    const status = message.includes("must be") ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
