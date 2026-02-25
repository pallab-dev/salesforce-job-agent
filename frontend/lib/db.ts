import { Pool } from "pg";

declare global {
  var __jobAgentPgPool: Pool | undefined;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("Missing DATABASE_URL");
  }
  return url;
}

function getPoolConfig() {
  const rawConnectionString = getDatabaseUrl();
  let connectionString = rawConnectionString;
  let ssl: { rejectUnauthorized: boolean } | undefined;

  try {
    const parsed = new URL(rawConnectionString);
    const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const isSupabaseHost = parsed.hostname.includes("supabase.com");
    if (sslmode === "require" || isSupabaseHost) {
      // Supabase/local dev commonly needs this in Node environments where CA chain
      // validation fails with "self-signed certificate in certificate chain".
      ssl = { rejectUnauthorized: false };
      parsed.searchParams.delete("sslmode");
      connectionString = parsed.toString();
    }
  } catch {
    // Fall back to plain connection string usage.
  }

  return ssl ? { connectionString, ssl } : { connectionString };
}

export function getPool(): Pool {
  if (!global.__jobAgentPgPool) {
    global.__jobAgentPgPool = new Pool(getPoolConfig());
  }
  return global.__jobAgentPgPool;
}

export type LoginInput = {
  username: string;
  emailTo: string;
  timezone?: string | null;
};

export type DbUser = {
  id: number;
  username: string;
  email_to: string;
  timezone: string | null;
  is_active: boolean;
};

export type UserPreferences = {
  user_id: number;
  keyword: string | null;
  llm_input_limit: number | null;
  max_bullets: number | null;
  remote_only: boolean | null;
  strict_senior_only: boolean | null;
  profile_overrides: Record<string, unknown> | null;
};

export type UserPreferencesInput = {
  userId: number;
  keyword?: string | null;
  llmInputLimit?: number | null;
  maxBullets?: number | null;
  remoteOnly?: boolean | null;
  strictSeniorOnly?: boolean | null;
  profileOverrides?: Record<string, unknown> | null;
};

export type AdminUserRow = {
  id: number;
  username: string;
  email_to: string;
  is_active: boolean;
  timezone: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminUserPreferenceRow = {
  user_id: number;
  username: string;
  keyword: string | null;
  llm_input_limit: number | null;
  max_bullets: number | null;
  remote_only: boolean | null;
  strict_senior_only: boolean | null;
  updated_at: string | null;
};

export type AdminUserStateRow = {
  user_id: number;
  username: string;
  last_run_at: string | null;
  last_email_sent_at: string | null;
  last_status: string | null;
  last_error: string | null;
  updated_at: string | null;
};

export type AdminRunLogRow = {
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
};

export type AdminAuditLogRow = {
  id: number;
  admin_username: string | null;
  admin_email_to: string | null;
  action: string;
  target_username: string | null;
  target_email_to: string | null;
  metadata_jsonb: Record<string, unknown> | null;
  created_at: string | null;
};

export type AdminAuditLogListResult = {
  rows: AdminAuditLogRow[];
  tableReady: boolean;
};

export type ResumeAnalysisPersistenceInput = {
  userId: number;
  source: string;
  resumeText: string;
  textChecksumSha256: string;
  analysisVersion: string;
  promptVersion: string;
  scoringVersion: string;
  modelProvider: string;
  modelName: string;
  llmUsed: boolean;
  status: "success" | "fallback";
  scoreBreakdown: Record<string, unknown>;
  analysisPayload: Record<string, unknown>;
  normalizedProfile: Record<string, unknown>;
  recommendations: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
};

export type ResumeAnalysisPersistenceResult = {
  resume_version_id: number;
  resume_insight_id: number;
  profile_signal_id: number;
};

export async function upsertUser(input: LoginInput) {
  const pool = getPool();
  const username = input.username.trim();
  const emailTo = input.emailTo.trim();
  const timezone = input.timezone?.trim() || null;

  const result = await pool.query(
    `
      INSERT INTO users (username, email_to, is_active, timezone)
      VALUES ($1, $2, TRUE, $3)
      ON CONFLICT (username)
      DO UPDATE SET
        email_to = EXCLUDED.email_to,
        is_active = EXCLUDED.is_active,
        timezone = EXCLUDED.timezone,
        updated_at = NOW()
      RETURNING id, username, email_to, timezone, is_active
    `,
    [username, emailTo, timezone]
  );

  return result.rows[0];
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT id, username, email_to, timezone, is_active
      FROM users
      WHERE username = $1
      LIMIT 1
    `,
    [username.trim()]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: Number(row.id),
    username: String(row.username),
    email_to: String(row.email_to),
    timezone: row.timezone ? String(row.timezone) : null,
    is_active: Boolean(row.is_active)
  };
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT id, username, email_to, timezone, is_active
      FROM users
      WHERE LOWER(email_to) = LOWER($1)
      LIMIT 1
    `,
    [email.trim()]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: Number(row.id),
    username: String(row.username),
    email_to: String(row.email_to),
    timezone: row.timezone ? String(row.timezone) : null,
    is_active: Boolean(row.is_active)
  };
}

export async function getUserPreferences(userId: number): Promise<UserPreferences | null> {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT user_id, keyword, llm_input_limit, max_bullets, remote_only, strict_senior_only, profile_overrides_jsonb
      FROM user_preferences
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    user_id: Number(row.user_id),
    keyword: row.keyword ? String(row.keyword) : null,
    llm_input_limit:
      row.llm_input_limit === null || row.llm_input_limit === undefined ? null : Number(row.llm_input_limit),
    max_bullets: row.max_bullets === null || row.max_bullets === undefined ? null : Number(row.max_bullets),
    remote_only:
      row.remote_only === null || row.remote_only === undefined ? null : Boolean(row.remote_only),
    strict_senior_only:
      row.strict_senior_only === null || row.strict_senior_only === undefined
        ? null
        : Boolean(row.strict_senior_only),
    profile_overrides:
      row.profile_overrides_jsonb && typeof row.profile_overrides_jsonb === "object"
        ? (row.profile_overrides_jsonb as Record<string, unknown>)
        : null
  };
}

export async function upsertUserPreferences(input: UserPreferencesInput): Promise<UserPreferences> {
  const llmInputLimit =
    input.llmInputLimit == null ? null : Math.max(1, Math.min(80, Math.trunc(input.llmInputLimit)));
  const maxBullets = input.maxBullets == null ? null : Math.max(1, Math.min(20, Math.trunc(input.maxBullets)));
  const pool = getPool();
  const result = await pool.query(
    `
      INSERT INTO user_preferences (
        user_id, keyword, llm_input_limit, max_bullets, remote_only, strict_senior_only, profile_overrides_jsonb, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        keyword = EXCLUDED.keyword,
        llm_input_limit = EXCLUDED.llm_input_limit,
        max_bullets = EXCLUDED.max_bullets,
        remote_only = EXCLUDED.remote_only,
        strict_senior_only = EXCLUDED.strict_senior_only,
        profile_overrides_jsonb = COALESCE(EXCLUDED.profile_overrides_jsonb, user_preferences.profile_overrides_jsonb),
        updated_at = NOW()
      RETURNING user_id, keyword, llm_input_limit, max_bullets, remote_only, strict_senior_only, profile_overrides_jsonb
    `,
    [
      input.userId,
      input.keyword?.trim() || null,
      llmInputLimit,
      maxBullets,
      input.remoteOnly ?? null,
      input.strictSeniorOnly ?? null,
      input.profileOverrides ? JSON.stringify(input.profileOverrides) : null
    ]
  );

  const row = result.rows[0];
  return {
    user_id: Number(row.user_id),
    keyword: row.keyword ? String(row.keyword) : null,
    llm_input_limit:
      row.llm_input_limit === null || row.llm_input_limit === undefined ? null : Number(row.llm_input_limit),
    max_bullets: row.max_bullets === null || row.max_bullets === undefined ? null : Number(row.max_bullets),
    remote_only:
      row.remote_only === null || row.remote_only === undefined ? null : Boolean(row.remote_only),
    strict_senior_only:
      row.strict_senior_only === null || row.strict_senior_only === undefined
        ? null
        : Boolean(row.strict_senior_only),
    profile_overrides:
      row.profile_overrides_jsonb && typeof row.profile_overrides_jsonb === "object"
        ? (row.profile_overrides_jsonb as Record<string, unknown>)
        : null
  };
}

export async function markOnboardingCompleted(userId: number): Promise<void> {
  const existing = await getUserPreferences(userId);
  const root =
    existing?.profile_overrides && typeof existing.profile_overrides === "object"
      ? ({ ...existing.profile_overrides } as Record<string, unknown>)
      : {};
  const onboarding =
    root["onboarding"] && typeof root["onboarding"] === "object"
      ? ({ ...(root["onboarding"] as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  await upsertUserPreferences({
    userId,
    keyword: existing?.keyword ?? null,
    llmInputLimit: existing?.llm_input_limit ?? null,
    maxBullets: existing?.max_bullets ?? null,
    remoteOnly: existing?.remote_only ?? null,
    strictSeniorOnly: existing?.strict_senior_only ?? null,
    profileOverrides: {
      ...root,
      onboarding: {
        ...onboarding,
        completed: true,
        completed_at: new Date().toISOString(),
        last_completed_step: 2
      }
    }
  });
}

export async function updateOnboardingProgress(userId: number, lastCompletedStep: number): Promise<void> {
  const safeStep = Math.max(0, Math.min(2, Math.trunc(lastCompletedStep)));
  const existing = await getUserPreferences(userId);
  const root =
    existing?.profile_overrides && typeof existing.profile_overrides === "object"
      ? ({ ...existing.profile_overrides } as Record<string, unknown>)
      : {};
  const onboarding =
    root["onboarding"] && typeof root["onboarding"] === "object"
      ? ({ ...(root["onboarding"] as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  await upsertUserPreferences({
    userId,
    keyword: existing?.keyword ?? null,
    llmInputLimit: existing?.llm_input_limit ?? null,
    maxBullets: existing?.max_bullets ?? null,
    remoteOnly: existing?.remote_only ?? null,
    strictSeniorOnly: existing?.strict_senior_only ?? null,
    profileOverrides: {
      ...root,
      onboarding: {
        ...onboarding,
        last_completed_step: safeStep
      }
    }
  });
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT id, username, email_to, is_active, timezone, created_at, updated_at
      FROM users
      ORDER BY username ASC
    `
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    username: String(row.username),
    email_to: String(row.email_to),
    is_active: Boolean(row.is_active),
    timezone: row.timezone ? String(row.timezone) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null
  }));
}

export async function listAdminUserPreferences(): Promise<AdminUserPreferenceRow[]> {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT p.user_id, u.username, p.keyword, p.llm_input_limit, p.max_bullets,
             p.remote_only, p.strict_senior_only, p.updated_at
      FROM user_preferences p
      JOIN users u ON u.id = p.user_id
      ORDER BY u.username ASC
    `
  );
  return result.rows.map((row) => ({
    user_id: Number(row.user_id),
    username: String(row.username),
    keyword: row.keyword ? String(row.keyword) : null,
    llm_input_limit: row.llm_input_limit == null ? null : Number(row.llm_input_limit),
    max_bullets: row.max_bullets == null ? null : Number(row.max_bullets),
    remote_only: row.remote_only == null ? null : Boolean(row.remote_only),
    strict_senior_only: row.strict_senior_only == null ? null : Boolean(row.strict_senior_only),
    updated_at: row.updated_at ? String(row.updated_at) : null
  }));
}

export async function listAdminUserState(): Promise<AdminUserStateRow[]> {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT s.user_id, u.username, s.last_run_at, s.last_email_sent_at,
             s.last_status, s.last_error, s.updated_at
      FROM user_state s
      JOIN users u ON u.id = s.user_id
      ORDER BY COALESCE(s.updated_at, s.last_run_at) DESC NULLS LAST, u.username ASC
    `
  );
  return result.rows.map((row) => ({
    user_id: Number(row.user_id),
    username: String(row.username),
    last_run_at: row.last_run_at ? String(row.last_run_at) : null,
    last_email_sent_at: row.last_email_sent_at ? String(row.last_email_sent_at) : null,
    last_status: row.last_status ? String(row.last_status) : null,
    last_error: row.last_error ? String(row.last_error) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null
  }));
}

export async function listAdminRunLogs(limit = 100): Promise<AdminRunLogRow[]> {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT r.id, u.username, r.run_type, r.status, r.fetched_jobs_count,
             r.keyword_jobs_count, r.emailed_jobs_count, r.error_message,
             r.started_at, r.finished_at
      FROM run_logs r
      LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.started_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    username: row.username ? String(row.username) : null,
    run_type: String(row.run_type),
    status: String(row.status),
    fetched_jobs_count: row.fetched_jobs_count == null ? null : Number(row.fetched_jobs_count),
    keyword_jobs_count: row.keyword_jobs_count == null ? null : Number(row.keyword_jobs_count),
    emailed_jobs_count: row.emailed_jobs_count == null ? null : Number(row.emailed_jobs_count),
    error_message: row.error_message ? String(row.error_message) : null,
    started_at: row.started_at ? String(row.started_at) : null,
    finished_at: row.finished_at ? String(row.finished_at) : null
  }));
}

export async function listAdminAuditLogs(limit = 100): Promise<AdminAuditLogListResult> {
  const pool = getPool();
  try {
    const result = await pool.query(
      `
        SELECT id, admin_username, admin_email_to, action, target_username, target_email_to, metadata_jsonb, created_at
        FROM admin_audit_logs
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit]
    );
    return {
      tableReady: true,
      rows: result.rows.map((row) => ({
        id: Number(row.id),
        admin_username: row.admin_username ? String(row.admin_username) : null,
        admin_email_to: row.admin_email_to ? String(row.admin_email_to) : null,
        action: String(row.action),
        target_username: row.target_username ? String(row.target_username) : null,
        target_email_to: row.target_email_to ? String(row.target_email_to) : null,
        metadata_jsonb:
          row.metadata_jsonb && typeof row.metadata_jsonb === "object"
            ? (row.metadata_jsonb as Record<string, unknown>)
            : null,
        created_at: row.created_at ? String(row.created_at) : null
      }))
    };
  } catch (error) {
    // Allow admin page to load before schema migration is applied.
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "42P01") {
      return { tableReady: false, rows: [] };
    }
    throw error;
  }
}

export async function insertAdminAuditLog(input: {
  adminUserId: number | null;
  adminUsername: string | null;
  adminEmailTo: string | null;
  action: string;
  targetUserId: number | null;
  targetUsername: string | null;
  targetEmailTo: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<boolean> {
  const pool = getPool();
  try {
    await pool.query(
      `
        INSERT INTO admin_audit_logs (
          admin_user_id, admin_username, admin_email_to, action,
          target_user_id, target_username, target_email_to, metadata_jsonb, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
      `,
      [
        input.adminUserId,
        input.adminUsername,
        input.adminEmailTo,
        input.action,
        input.targetUserId,
        input.targetUsername,
        input.targetEmailTo,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );
    return true;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "42P01") {
      // Schema not migrated yet. Don't block admin actions; just skip logging.
      return false;
    }
    throw error;
  }
}

export async function setUserActiveStatus(username: string, isActive: boolean): Promise<void> {
  const pool = getPool();
  await pool.query(
    `
      UPDATE users
      SET is_active = $2, updated_at = NOW()
      WHERE username = $1
    `,
    [username.trim(), isActive]
  );
}

let resumeIntelligenceTablesReadyPromise: Promise<void> | null = null;

async function ensureResumeIntelligenceTables(): Promise<void> {
  if (resumeIntelligenceTablesReadyPromise) {
    return resumeIntelligenceTablesReadyPromise;
  }

  const pool = getPool();
  resumeIntelligenceTablesReadyPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resume_versions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source TEXT NOT NULL DEFAULT 'onboarding',
        raw_text TEXT NOT NULL,
        text_checksum_sha256 TEXT NOT NULL,
        metadata_jsonb JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_resume_versions_user_created
      ON resume_versions (user_id, created_at DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resume_insights (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        resume_version_id BIGINT NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'success',
        analysis_version TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        scoring_version TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        llm_used BOOLEAN NOT NULL DEFAULT FALSE,
        score_overall INTEGER,
        score_breakdown_jsonb JSONB,
        analysis_jsonb JSONB NOT NULL,
        normalized_signals_jsonb JSONB,
        recommendations_jsonb JSONB,
        metadata_jsonb JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_resume_insights_user_created
      ON resume_insights (user_id, created_at DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_profile_signals (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        source_resume_version_id BIGINT REFERENCES resume_versions(id) ON DELETE SET NULL,
        source_resume_insight_id BIGINT REFERENCES resume_insights(id) ON DELETE SET NULL,
        profile_snapshot_jsonb JSONB NOT NULL,
        profile_version TEXT NOT NULL DEFAULT 'profile-signals-v1',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS market_skill_trends (
        id BIGSERIAL PRIMARY KEY,
        skill TEXT NOT NULL,
        market TEXT,
        trend_window TEXT NOT NULL DEFAULT '30d',
        demand_score NUMERIC(8,2),
        demand_delta NUMERIC(8,2),
        sample_size INTEGER,
        observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata_jsonb JSONB
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_market_skill_trends_skill_observed
      ON market_skill_trends (skill, observed_at DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_match_runs (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        run_reason TEXT NOT NULL,
        resume_insight_id BIGINT REFERENCES resume_insights(id) ON DELETE SET NULL,
        market_snapshot_at TIMESTAMPTZ,
        score_jsonb JSONB,
        matches_count INTEGER,
        recommendations_jsonb JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_alerts (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        alert_type TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'in_app',
        status TEXT NOT NULL DEFAULT 'pending',
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        metadata_jsonb JSONB,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_alerts_user_created
      ON user_alerts (user_id, created_at DESC);
    `);
  })().catch((error) => {
    resumeIntelligenceTablesReadyPromise = null;
    throw error;
  });

  return resumeIntelligenceTablesReadyPromise;
}

export async function saveResumeAnalysisArtifacts(
  input: ResumeAnalysisPersistenceInput
): Promise<ResumeAnalysisPersistenceResult> {
  await ensureResumeIntelligenceTables();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resumeVersionResult = await client.query(
      `
        INSERT INTO resume_versions (
          user_id, source, raw_text, text_checksum_sha256, metadata_jsonb, created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
        RETURNING id
      `,
      [
        input.userId,
        input.source,
        input.resumeText,
        input.textChecksumSha256,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );
    const resumeVersionId = Number(resumeVersionResult.rows[0].id);

    const scoreOverallRaw = input.scoreBreakdown["overall_score"];
    const scoreOverall =
      typeof scoreOverallRaw === "number"
        ? Math.max(0, Math.min(100, Math.round(scoreOverallRaw)))
        : typeof scoreOverallRaw === "string" && scoreOverallRaw.trim()
          ? Math.max(0, Math.min(100, Math.round(Number(scoreOverallRaw))))
          : null;

    const insightResult = await client.query(
      `
        INSERT INTO resume_insights (
          user_id, resume_version_id, status, analysis_version, prompt_version, scoring_version,
          model_provider, model_name, llm_used, score_overall, score_breakdown_jsonb,
          analysis_jsonb, normalized_signals_jsonb, recommendations_jsonb, metadata_jsonb, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, NOW())
        RETURNING id
      `,
      [
        input.userId,
        resumeVersionId,
        input.status,
        input.analysisVersion,
        input.promptVersion,
        input.scoringVersion,
        input.modelProvider,
        input.modelName,
        input.llmUsed,
        scoreOverall,
        JSON.stringify(input.scoreBreakdown),
        JSON.stringify(input.analysisPayload),
        JSON.stringify(input.normalizedProfile),
        JSON.stringify(input.recommendations),
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );
    const resumeInsightId = Number(insightResult.rows[0].id);

    const profileSignalResult = await client.query(
      `
        INSERT INTO user_profile_signals (
          user_id, source_resume_version_id, source_resume_insight_id, profile_snapshot_jsonb, profile_version, updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          source_resume_version_id = EXCLUDED.source_resume_version_id,
          source_resume_insight_id = EXCLUDED.source_resume_insight_id,
          profile_snapshot_jsonb = EXCLUDED.profile_snapshot_jsonb,
          profile_version = EXCLUDED.profile_version,
          updated_at = NOW()
        RETURNING id
      `,
      [input.userId, resumeVersionId, resumeInsightId, JSON.stringify(input.normalizedProfile), "profile-signals-v1"]
    );
    const profileSignalId = Number(profileSignalResult.rows[0].id);

    await client.query("COMMIT");
    return {
      resume_version_id: resumeVersionId,
      resume_insight_id: resumeInsightId,
      profile_signal_id: profileSignalId
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
