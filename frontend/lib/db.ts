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
