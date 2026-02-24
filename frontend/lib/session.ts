import { cookies } from "next/headers";
import { DbUser, getUserByUsername } from "./db";

function normalizeList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export async function getCurrentUserFromCookies(): Promise<DbUser | null> {
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

export function isAdminUser(user: DbUser | null): boolean {
  if (!user) {
    return false;
  }

  const adminEmails = normalizeList(process.env.ADMIN_EMAIL_ALLOWLIST);
  const adminUsernames = normalizeList(process.env.ADMIN_USERNAME_ALLOWLIST);
  const email = user.email_to.trim().toLowerCase();
  const username = user.username.trim().toLowerCase();

  if (adminEmails.length === 0 && adminUsernames.length === 0) {
    return false;
  }

  return adminEmails.includes(email) || adminUsernames.includes(username);
}
