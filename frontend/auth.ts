import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getUserByEmail, getUserByUsername, upsertUser } from "./lib/db";

function envOrPlaceholder(name: string): string {
  return process.env[name]?.trim() || `missing-${name.toLowerCase()}`;
}

function usernameFromEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const { handlers, auth } = NextAuth({
  providers: [
    Google({
      clientId: envOrPlaceholder("AUTH_GOOGLE_ID"),
      clientSecret: envOrPlaceholder("AUTH_GOOGLE_SECRET")
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async signIn({ user }) {
      const email = (user.email || "").trim().toLowerCase();
      if (!email) {
        return false;
      }

      try {
        const existing = await getUserByEmail(email);
        const username = existing?.username || usernameFromEmail(email);
        await upsertUser({
          username,
          emailTo: email,
          timezone: null
        });
        return true;
      } catch (error) {
        console.error("Failed to upsert user during sign-in", error);
        return false;
      }
    },
    async session({ session }) {
      const email = (session.user?.email || "").trim().toLowerCase();
      if (!email || !session.user) {
        return session;
      }

      const username = usernameFromEmail(email);
      try {
        const dbUser = await getUserByUsername(username);
        (session.user as { appUsername?: string }).appUsername = dbUser?.username || username;
      } catch {
        (session.user as { appUsername?: string }).appUsername = username;
      }
      return session;
    }
  },
  pages: {
    signIn: "/auth"
  }
});
