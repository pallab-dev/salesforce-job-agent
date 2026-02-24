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
};

export type UserPreferencesInput = {
  userId: number;
  keyword?: string | null;
  llmInputLimit?: number | null;
  maxBullets?: number | null;
  remoteOnly?: boolean | null;
  strictSeniorOnly?: boolean | null;
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
      SELECT user_id, keyword, llm_input_limit, max_bullets, remote_only, strict_senior_only
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
        : Boolean(row.strict_senior_only)
  };
}

export async function upsertUserPreferences(input: UserPreferencesInput): Promise<UserPreferences> {
  const pool = getPool();
  const result = await pool.query(
    `
      INSERT INTO user_preferences (
        user_id, keyword, llm_input_limit, max_bullets, remote_only, strict_senior_only, profile_overrides_jsonb, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NULL, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        keyword = EXCLUDED.keyword,
        llm_input_limit = EXCLUDED.llm_input_limit,
        max_bullets = EXCLUDED.max_bullets,
        remote_only = EXCLUDED.remote_only,
        strict_senior_only = EXCLUDED.strict_senior_only,
        updated_at = NOW()
      RETURNING user_id, keyword, llm_input_limit, max_bullets, remote_only, strict_senior_only
    `,
    [
      input.userId,
      input.keyword?.trim() || null,
      input.llmInputLimit ?? null,
      input.maxBullets ?? null,
      input.remoteOnly ?? null,
      input.strictSeniorOnly ?? null
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
        : Boolean(row.strict_senior_only)
  };
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
