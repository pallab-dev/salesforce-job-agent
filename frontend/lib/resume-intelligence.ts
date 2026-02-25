type ExperienceLevel = "" | "entry" | "mid" | "senior" | "staff";

export type ResumeAnalysisResult = {
  extracted_keywords: string[];
  score: number;
  score_breakdown: {
    overall_score: number;
    resume_quality_score: number;
    role_match_score: number;
    market_fit_score: number;
    keyword_coverage_score: number;
  };
  analysis: string[];
  suggestions: string[];
  recommended: {
    keyword: string;
    experience_level: ExperienceLevel;
    target_roles: string[];
    tech_stack_tags: string[];
    negative_keywords: string[];
  };
  normalized_profile: {
    experience_level: ExperienceLevel;
    target_roles: string[];
    tech_stack_tags: string[];
    core_skills: string[];
    inferred_domains: string[];
    strengths: string[];
    gap_signals: string[];
    market_focus_skills: string[];
  };
  metadata: {
    analysis_version: string;
    scoring_version: string;
    prompt_version: string;
    model_provider: "groq" | "none";
    model_name: string;
    llm_used: boolean;
    fallback_reason: string | null;
  };
};

export type ResumeAnalysisInput = {
  resumeText: string;
  existingPreferences?: {
    keyword?: string | null;
    experience_level?: string | null;
    target_roles?: string[];
    tech_stack_tags?: string[];
    primary_goal?: string | null;
    alert_frequency?: string | null;
  };
  groq?: {
    apiKey: string;
    model: string;
    apiUrl: string;
    timeoutMs?: number;
  } | null;
};

type DeterministicSignals = {
  wordsCount: number;
  extractedKeywords: string[];
  targetRoles: string[];
  techStackTags: string[];
  experienceLevel: ExperienceLevel;
  hasNumbers: boolean;
  hasProjects: boolean;
  hasSummary: boolean;
  hasSkillsSection: boolean;
  hasImpactVerbs: boolean;
  hasContactSignals: boolean;
  inferredDomains: string[];
  strengths: string[];
  gaps: string[];
  marketFocusSkills: string[];
  recommendedKeyword: string;
  negativeKeywords: string[];
};

type GroqResumeJson = {
  strengths?: unknown;
  risks?: unknown;
  suggestions?: unknown;
  target_roles?: unknown;
  tech_stack_tags?: unknown;
  missing_keywords?: unknown;
  market_focus_skills?: unknown;
  experience_level?: unknown;
  summary_assessment?: unknown;
};

const ANALYSIS_VERSION = "resume-intel-v1";
const SCORING_VERSION = "resume-score-v1";
const PROMPT_VERSION = "resume-groq-v1";

const KNOWN_SKILLS = [
  "salesforce",
  "apex",
  "lwc",
  "lightning",
  "soql",
  "flow",
  "python",
  "django",
  "flask",
  "fastapi",
  "java",
  "spring",
  "kotlin",
  "javascript",
  "typescript",
  "react",
  "next.js",
  "node.js",
  "node",
  "express",
  "postgresql",
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "aws",
  "gcp",
  "azure",
  "docker",
  "kubernetes",
  "terraform",
  "ci/cd",
  "github actions",
  "gitlab ci",
  "graphql",
  "rest",
  "microservices",
  "linux",
  "pandas",
  "numpy",
  "airflow",
  "spark",
  "dbt",
  "snowflake",
  "etl",
  "sql",
  "langchain",
  "rag",
  "llm"
] as const;

const ROLE_MATCHERS = [
  { role: "salesforce developer", terms: ["salesforce", "apex", "lwc", "lightning", "soql"] },
  { role: "backend engineer", terms: ["python", "java", "node", "api", "microservice", "postgres"] },
  { role: "fullstack engineer", terms: ["react", "next.js", "node", "typescript", "javascript"] },
  { role: "data engineer", terms: ["airflow", "spark", "etl", "sql", "warehouse", "dbt"] },
  { role: "devops engineer", terms: ["docker", "kubernetes", "terraform", "aws", "ci/cd"] }
] as const;

function includesTerm(text: string, term: string): boolean {
  return text.includes(term.toLowerCase());
}

function uniq(values: string[], limit = 999): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).slice(0, limit);
}

function asStringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return uniq(
    value
      .map((item) => (typeof item === "string" ? item : ""))
      .map((item) => item.trim())
      .filter(Boolean),
    limit
  );
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function inferExperienceLevel(text: string): ExperienceLevel {
  const years = Array.from(text.matchAll(/(\d{1,2})\+?\s+years?/g))
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  const maxYears = years.length ? Math.max(...years) : 0;

  if (text.includes("principal") || text.includes("staff engineer")) return "staff";
  if (text.includes("senior") || text.includes("lead developer") || text.includes("tech lead") || maxYears >= 6) return "senior";
  if (maxYears >= 2) return "mid";
  if (maxYears > 0 || text.includes("intern") || text.includes("graduate")) return "entry";
  return "";
}

function analyzeDeterministic(resumeText: string): DeterministicSignals {
  const normalized = resumeText.toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  const extractedSkills = KNOWN_SKILLS.filter((skill) => includesTerm(normalized, skill)).map(String);
  const extractedKeywords = uniq(
    [
      ...extractedSkills,
      ...(normalized.includes("api") ? ["apis"] : []),
      ...(normalized.includes("testing") || normalized.includes("pytest") || normalized.includes("jest") ? ["testing"] : []),
      ...(normalized.includes("agile") ? ["agile"] : []),
      ...(normalized.includes("integration") ? ["integrations"] : [])
    ],
    20
  );
  const targetRoles = uniq(
    ROLE_MATCHERS.filter((matcher) => matcher.terms.filter((term) => includesTerm(normalized, term)).length >= 2).map(
      (matcher) => matcher.role
    ),
    5
  );
  if (targetRoles.length === 0) {
    if (normalized.includes("salesforce")) targetRoles.push("salesforce developer");
    else if (normalized.includes("react") || normalized.includes("frontend")) targetRoles.push("fullstack engineer");
    else targetRoles.push("backend engineer");
  }

  const techStackTags = uniq(
    extractedSkills
      .filter((skill) => !["ci/cd", "github actions", "gitlab ci", "rest"].includes(skill))
      .map((skill) => (skill === "node.js" ? "node" : skill === "postgresql" ? "postgres" : skill)),
    14
  );
  const experienceLevel = inferExperienceLevel(normalized);
  const hasNumbers = /\b\d+(%|\+|x|k|m)?\b/i.test(resumeText);
  const hasProjects = /(project|projects)/i.test(resumeText);
  const hasSummary = /(summary|profile|objective)/i.test(resumeText);
  const hasSkillsSection = /\bskills\b/i.test(resumeText);
  const hasImpactVerbs = /(built|led|improved|designed|optimized|implemented|delivered|launched|reduced)/i.test(resumeText);
  const hasContactSignals = /@|linkedin|github/i.test(resumeText);

  const inferredDomains = uniq(
    [
      ...(normalized.includes("salesforce") ? ["crm"] : []),
      ...(normalized.includes("ecommerce") ? ["ecommerce"] : []),
      ...(normalized.includes("fintech") ? ["fintech"] : []),
      ...(normalized.includes("healthcare") ? ["healthcare"] : []),
      ...(normalized.includes("etl") || normalized.includes("data pipeline") ? ["data-platform"] : []),
      ...(normalized.includes("microservices") || normalized.includes("distributed") ? ["distributed-systems"] : [])
    ],
    8
  );

  const marketFocusSkills = uniq(
    [
      ...(techStackTags.includes("aws") ? ["aws"] : []),
      ...(techStackTags.includes("kubernetes") ? ["kubernetes"] : []),
      ...(techStackTags.includes("terraform") ? ["terraform"] : []),
      ...(techStackTags.includes("python") ? ["python"] : []),
      ...(techStackTags.includes("react") ? ["react"] : []),
      ...(normalized.includes("llm") || normalized.includes("rag") ? ["llm", "rag"] : []),
      ...(normalized.includes("salesforce") ? ["salesforce", "lwc"] : [])
    ],
    10
  );

  const strengths = uniq(
    [
      ...(hasImpactVerbs ? ["action-oriented bullet writing"] : []),
      ...(hasNumbers ? ["impact metrics present"] : []),
      ...(hasSkillsSection ? ["clear skills section"] : []),
      ...(hasProjects ? ["project evidence"] : []),
      ...(techStackTags.length >= 6 ? ["broad technical stack"] : []),
      ...(targetRoles.length > 0 ? ["role signal clarity"] : [])
    ],
    8
  );

  const gaps = uniq(
    [
      ...(!hasSummary ? ["missing summary section"] : []),
      ...(!hasSkillsSection ? ["missing dedicated skills section"] : []),
      ...(!hasProjects ? ["missing project section"] : []),
      ...(!hasNumbers ? ["limited measurable outcomes"] : []),
      ...(extractedKeywords.length < 5 ? ["low keyword density for ATS matching"] : [])
    ],
    10
  );

  const topTech = techStackTags.slice(0, 2);
  const primaryRole = targetRoles[0] ?? "backend engineer";
  const recommendedKeyword = uniq([primaryRole, ...topTech]).join(", ");
  const negativeKeywords =
    experienceLevel === "entry" ? ["unpaid", "commission only"] : ["intern", "unpaid", "commission only"];

  return {
    wordsCount: words.length,
    extractedKeywords,
    targetRoles,
    techStackTags,
    experienceLevel,
    hasNumbers,
    hasProjects,
    hasSummary,
    hasSkillsSection,
    hasImpactVerbs,
    hasContactSignals,
    inferredDomains,
    strengths,
    gaps,
    marketFocusSkills,
    recommendedKeyword,
    negativeKeywords
  };
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
}

function toExperienceLevel(value: unknown): ExperienceLevel {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return s === "entry" || s === "mid" || s === "senior" || s === "staff" ? s : "";
}

function parseGroqJson(raw: string): GroqResumeJson | null {
  try {
    const cleaned = stripMarkdownFences(raw);
    const parsed = JSON.parse(cleaned) as GroqResumeJson;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function callGroqResumeAnalysis(
  resumeText: string,
  deterministic: DeterministicSignals,
  groq: NonNullable<ResumeAnalysisInput["groq"]>,
  existingPreferences: ResumeAnalysisInput["existingPreferences"]
): Promise<{ parsed: GroqResumeJson | null; rawText: string | null; fallbackReason: string | null }> {
  const snippet = resumeText.slice(0, 12000);
  const prompt = [
    "You are an expert resume analyst for technical hiring and job-market monitoring.",
    "Return STRICT JSON only. No markdown.",
    "Schema:",
    '{ "summary_assessment": string, "strengths": string[], "risks": string[], "suggestions": string[], "target_roles": string[], "tech_stack_tags": string[], "missing_keywords": string[], "market_focus_skills": string[], "experience_level": "entry|mid|senior|staff|"}',
    "Use concise business-language suggestions that help long-term job-market matching and alerts.",
    `Existing user preference keyword: ${existingPreferences?.keyword ?? ""}`,
    `Existing target roles: ${(existingPreferences?.target_roles ?? []).join(", ")}`,
    `Existing tech tags: ${(existingPreferences?.tech_stack_tags ?? []).join(", ")}`,
    `Deterministic extracted keywords: ${deterministic.extractedKeywords.join(", ")}`,
    `Deterministic target roles: ${deterministic.targetRoles.join(", ")}`,
    `Deterministic tech tags: ${deterministic.techStackTags.join(", ")}`,
    "Resume text:",
    snippet
  ].join("\n");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), groq.timeoutMs ?? 30000);
    try {
      const response = await fetch(groq.apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groq.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: groq.model,
          temperature: 0.1,
          messages: [{ role: "user", content: prompt }]
        }),
        signal: controller.signal
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const err = typeof data.error === "object" && data.error ? JSON.stringify(data.error) : response.statusText;
        return { parsed: null, rawText: null, fallbackReason: `groq_http_${response.status}:${err}` };
      }
      const content =
        typeof data === "object" &&
        data &&
        Array.isArray(data.choices) &&
        data.choices[0] &&
        typeof data.choices[0] === "object" &&
        data.choices[0] &&
        "message" in data.choices[0] &&
        typeof (data.choices[0] as { message?: unknown }).message === "object" &&
        (data.choices[0] as { message?: { content?: unknown } }).message?.content
          ? String((data.choices[0] as { message: { content: unknown } }).message.content)
          : "";
      const parsed = parseGroqJson(content);
      if (!parsed) {
        return { parsed: null, rawText: content, fallbackReason: "groq_invalid_json" };
      }
      return { parsed, rawText: content, fallbackReason: null };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      parsed: null,
      rawText: null,
      fallbackReason: error instanceof Error ? `groq_error:${error.message}` : "groq_error"
    };
  }
}

function buildScoreBreakdown(
  deterministic: DeterministicSignals,
  existingPreferences?: ResumeAnalysisInput["existingPreferences"],
  llm?: GroqResumeJson | null
) {
  const qualityBase =
    (deterministic.wordsCount >= 120 ? 15 : 5) +
    (deterministic.wordsCount <= 1400 ? 10 : 4) +
    (deterministic.hasSummary ? 10 : 0) +
    (deterministic.hasSkillsSection ? 15 : 0) +
    (deterministic.hasProjects ? 10 : 0) +
    (deterministic.hasNumbers ? 15 : 0) +
    (deterministic.hasImpactVerbs ? 10 : 0) +
    (deterministic.hasContactSignals ? 5 : 0);
  const resume_quality_score = clampScore(qualityBase);

  const keyword_coverage_score = clampScore(
    (deterministic.extractedKeywords.length >= 10 ? 95 : deterministic.extractedKeywords.length * 8) +
      (llm && asStringArray(llm.missing_keywords).length > 0 ? -10 : 0)
  );

  const prefRoles = uniq((existingPreferences?.target_roles ?? []).map(String).map((s) => s.toLowerCase()), 8);
  const prefTech = uniq((existingPreferences?.tech_stack_tags ?? []).map(String).map((s) => s.toLowerCase()), 12);
  const roleOverlap =
    prefRoles.length === 0
      ? 1
      : deterministic.targetRoles.filter((r) => prefRoles.some((p) => r.toLowerCase().includes(p) || p.includes(r.toLowerCase()))).length /
        prefRoles.length;
  const techOverlap =
    prefTech.length === 0
      ? 1
      : deterministic.techStackTags.filter((t) => prefTech.includes(t.toLowerCase())).length / Math.max(1, prefTech.length);
  const role_match_score = clampScore(roleOverlap * 60 + techOverlap * 25 + (deterministic.experienceLevel ? 15 : 5));

  const marketSignals = [
    "aws",
    "kubernetes",
    "terraform",
    "python",
    "react",
    "salesforce",
    "lwc",
    "postgres",
    "airflow",
    "llm",
    "rag"
  ];
  const marketCount = deterministic.techStackTags.filter((t) => marketSignals.includes(t)).length;
  const marketFitLlmBoost = llm ? Math.min(10, asStringArray(llm.market_focus_skills).length * 2) : 0;
  const market_fit_score = clampScore(35 + marketCount * 8 + marketFitLlmBoost + (deterministic.hasNumbers ? 5 : 0));

  const overall_score = clampScore(
    resume_quality_score * 0.35 + role_match_score * 0.25 + market_fit_score * 0.2 + keyword_coverage_score * 0.2
  );

  return {
    overall_score,
    resume_quality_score,
    role_match_score,
    market_fit_score,
    keyword_coverage_score
  };
}

function mergeAnalysis(
  deterministic: DeterministicSignals,
  score_breakdown: ResumeAnalysisResult["score_breakdown"],
  llm: GroqResumeJson | null,
  meta: ResumeAnalysisResult["metadata"]
): ResumeAnalysisResult {
  const llmStrengths = asStringArray(llm?.strengths, 8);
  const llmRisks = asStringArray(llm?.risks, 8);
  const llmSuggestions = asStringArray(llm?.suggestions, 10);
  const llmRoles = asStringArray(llm?.target_roles, 6);
  const llmTech = asStringArray(llm?.tech_stack_tags, 14);
  const llmMarket = asStringArray(llm?.market_focus_skills, 10);
  const llmMissing = asStringArray(llm?.missing_keywords, 12);
  const llmExperience = toExperienceLevel(llm?.experience_level);
  const llmSummary = typeof llm?.summary_assessment === "string" ? llm.summary_assessment.trim() : "";

  const experienceLevel = llmExperience || deterministic.experienceLevel;
  const targetRoles = uniq([...deterministic.targetRoles, ...llmRoles], 6);
  const techStackTags = uniq([...deterministic.techStackTags, ...llmTech], 14);
  const extractedKeywords = uniq([...deterministic.extractedKeywords, ...llmMissing.map((x) => x.toLowerCase())], 20);

  const analysis = uniq(
    [
      `Resume quality score ${score_breakdown.resume_quality_score}/100, role match score ${score_breakdown.role_match_score}/100.`,
      `Market fit score ${score_breakdown.market_fit_score}/100 and keyword coverage score ${score_breakdown.keyword_coverage_score}/100.`,
      `Detected ${extractedKeywords.length} relevant keywords and ${techStackTags.length} tech stack tags.`,
      experienceLevel ? `Inferred experience level: ${experienceLevel}.` : "Experience level is unclear from resume text.",
      deterministic.hasNumbers ? "Impact metrics are present." : "Impact metrics are missing or sparse.",
      ...deterministic.gaps.slice(0, 3).map((g) => `Gap signal: ${g}.`),
      ...(llmSummary ? [llmSummary] : []),
      ...llmStrengths.slice(0, 2).map((s) => `Strength: ${s}`),
      ...llmRisks.slice(0, 2).map((r) => `Risk: ${r}`)
    ],
    10
  );

  const suggestions = uniq(
    [
      ...llmSuggestions,
      ...deterministic.gaps.map((gap) => {
        if (gap === "missing summary section") return "Add a role-aligned summary (3-4 lines) with domain and impact focus.";
        if (gap === "missing dedicated skills section") return "Add a dedicated skills section with exact technologies and platforms.";
        if (gap === "missing project section") return "Add 1-2 projects with stack, scope, and measurable outcomes.";
        if (gap === "limited measurable outcomes") return "Add measurable impact to bullets (%, latency, throughput, revenue, cost, time saved).";
        return "Increase job-specific keywords to improve ATS and market-matching coverage.";
      }),
      ...(llmMissing.length
        ? [`Consider adding role-specific keywords if truthful: ${llmMissing.slice(0, 6).join(", ")}.`]
        : []),
      "Refresh your resume monthly as market demand shifts and re-run analysis for updated job alerts."
    ],
    8
  );

  const negativeKeywords =
    experienceLevel === "entry" ? ["unpaid", "commission only"] : ["intern", "unpaid", "commission only"];
  const recommendedKeyword = uniq([targetRoles[0] ?? "backend engineer", ...techStackTags.slice(0, 2)], 3).join(", ");

  return {
    extracted_keywords: extractedKeywords,
    score: score_breakdown.overall_score,
    score_breakdown,
    analysis,
    suggestions,
    recommended: {
      keyword: recommendedKeyword,
      experience_level: experienceLevel,
      target_roles: targetRoles,
      tech_stack_tags: techStackTags,
      negative_keywords: uniq(negativeKeywords, 6)
    },
    normalized_profile: {
      experience_level: experienceLevel,
      target_roles: targetRoles,
      tech_stack_tags: techStackTags,
      core_skills: techStackTags.slice(0, 10),
      inferred_domains: deterministic.inferredDomains,
      strengths: uniq([...deterministic.strengths, ...llmStrengths], 8),
      gap_signals: uniq([...deterministic.gaps, ...llmRisks], 10),
      market_focus_skills: uniq([...deterministic.marketFocusSkills, ...llmMarket], 10)
    },
    metadata: meta
  };
}

export async function analyzeResumeWithIntelligence(input: ResumeAnalysisInput): Promise<ResumeAnalysisResult> {
  const deterministic = analyzeDeterministic(input.resumeText);
  let llm: GroqResumeJson | null = null;
  let fallbackReason: string | null = null;
  let modelProvider: "groq" | "none" = "none";
  let modelName = "deterministic";

  if (input.groq?.apiKey) {
    const groqResult = await callGroqResumeAnalysis(input.resumeText, deterministic, input.groq, input.existingPreferences);
    llm = groqResult.parsed;
    fallbackReason = groqResult.fallbackReason;
    if (groqResult.parsed) {
      modelProvider = "groq";
      modelName = input.groq.model;
    }
  } else {
    fallbackReason = "missing_groq_api_key";
  }

  const score_breakdown = buildScoreBreakdown(deterministic, input.existingPreferences, llm);
  return mergeAnalysis(deterministic, score_breakdown, llm, {
    analysis_version: ANALYSIS_VERSION,
    scoring_version: SCORING_VERSION,
    prompt_version: PROMPT_VERSION,
    model_provider: modelProvider,
    model_name: modelName,
    llm_used: Boolean(llm),
    fallback_reason: llm ? null : fallbackReason
  });
}
