import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { analyzeResumeWithIntelligence } from "../../../../lib/resume-intelligence";
import { getUserByUsername, getUserPreferences, saveResumeAnalysisArtifacts } from "../../../../lib/db";

export const runtime = "nodejs";

type AnalyzeResumePayload = {
  resume_text?: unknown;
  source?: unknown;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((v) => v.trim()).filter(Boolean) : [];
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

function extractExistingProfileSignals(prefs: Awaited<ReturnType<typeof getUserPreferences>>) {
  const root =
    prefs?.profile_overrides && typeof prefs.profile_overrides === "object"
      ? (prefs.profile_overrides as Record<string, unknown>)
      : {};
  const profile = root.profile && typeof root.profile === "object" ? (root.profile as Record<string, unknown>) : {};
  const product = root.product && typeof root.product === "object" ? (root.product as Record<string, unknown>) : {};

  return {
    keyword: prefs?.keyword ?? "",
    experience_level: typeof profile.experience_level === "string" ? profile.experience_level : "",
    target_roles: asStringArray(profile.target_roles),
    tech_stack_tags: asStringArray(profile.tech_stack_tags),
    primary_goal: typeof product.primary_goal === "string" ? product.primary_goal : "",
    alert_frequency: typeof product.alert_frequency === "string" ? product.alert_frequency : ""
  };
}

export async function POST(request: Request) {
  try {
    const user = await resolveSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: AnalyzeResumePayload;
    try {
      body = (await request.json()) as AnalyzeResumePayload;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const resumeText = asTrimmedString(body.resume_text);
    const source = asTrimmedString(body.source) || "onboarding";

    if (resumeText.length < 80) {
      return NextResponse.json({ ok: false, error: "Resume text is too short for analysis" }, { status: 400 });
    }
    if (resumeText.length > 100_000) {
      return NextResponse.json({ ok: false, error: "Resume text is too large" }, { status: 400 });
    }

    const prefs = await getUserPreferences(user.id);
    const existingSignals = extractExistingProfileSignals(prefs);

    const analysis = await analyzeResumeWithIntelligence({
      resumeText,
      existingPreferences: existingSignals,
      groq: process.env.GROQ_API_KEY?.trim()
        ? {
            apiKey: process.env.GROQ_API_KEY.trim(),
            model: process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant",
            apiUrl: process.env.GROQ_API_URL?.trim() || "https://api.groq.com/openai/v1/chat/completions",
            timeoutMs: Number(process.env.GROQ_TIMEOUT_MS || 30000)
          }
        : null
    });

    const checksum = crypto.createHash("sha256").update(resumeText).digest("hex");
    const persistence = await saveResumeAnalysisArtifacts({
      userId: user.id,
      source,
      resumeText,
      textChecksumSha256: checksum,
      analysisVersion: analysis.metadata.analysis_version,
      promptVersion: analysis.metadata.prompt_version,
      scoringVersion: analysis.metadata.scoring_version,
      modelProvider: analysis.metadata.model_provider,
      modelName: analysis.metadata.model_name,
      llmUsed: analysis.metadata.llm_used,
      status: analysis.metadata.llm_used ? "success" : "fallback",
      scoreBreakdown: analysis.score_breakdown as unknown as Record<string, unknown>,
      analysisPayload: {
        extracted_keywords: analysis.extracted_keywords,
        score: analysis.score,
        score_breakdown: analysis.score_breakdown,
        analysis: analysis.analysis,
        suggestions: analysis.suggestions,
        metadata: analysis.metadata
      },
      normalizedProfile: analysis.normalized_profile as unknown as Record<string, unknown>,
      recommendations: analysis.recommended as unknown as Record<string, unknown>,
      metadata: {
        source,
        user_username: user.username,
        text_length: resumeText.length
      }
    });

    return NextResponse.json({
      ok: true,
      analysis,
      persistence
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze resume";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

