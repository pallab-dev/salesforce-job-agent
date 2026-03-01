import { NextResponse } from "next/server";

export const runtime = "nodejs";

function has(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  const authUrl = process.env.AUTH_URL?.trim() || "";
  const emailProvider = (process.env.EMAIL_PROVIDER || "smtp").trim().toLowerCase();

  const oauth = {
    auth_google_id_set: has("AUTH_GOOGLE_ID"),
    auth_google_secret_set: has("AUTH_GOOGLE_SECRET"),
    auth_secret_set: has("AUTH_SECRET"),
    auth_url_set: Boolean(authUrl),
    auth_trust_host_set: (process.env.AUTH_TRUST_HOST || "").trim().toLowerCase() === "true"
  };

  const smtp = {
    smtp_host_set: has("SMTP_HOST"),
    smtp_port_set: has("SMTP_PORT"),
    smtp_user_set: has("SMTP_USER"),
    smtp_pass_set: has("SMTP_PASS"),
    smtp_from_set: has("SMTP_FROM")
  };

  const resend = {
    resend_api_key_set: has("RESEND_API_KEY"),
    resend_from_set: has("RESEND_FROM")
  };

  const otp = {
    otp_secret_set: has("OTP_SECRET") || has("AUTH_SECRET")
  };

  const oauthReady =
    oauth.auth_google_id_set &&
    oauth.auth_google_secret_set &&
    oauth.auth_secret_set &&
    oauth.auth_url_set;

  const smtpReady =
    smtp.smtp_host_set &&
    smtp.smtp_port_set &&
    smtp.smtp_user_set &&
    smtp.smtp_pass_set &&
    smtp.smtp_from_set;

  const resendReady = resend.resend_api_key_set && resend.resend_from_set;

  const emailReady = emailProvider === "resend" ? resendReady : smtpReady;

  return NextResponse.json({
    ok: true,
    provider: {
      email_provider: emailProvider,
      auth_url_host: authUrl ? (() => {
        try {
          return new URL(authUrl).host;
        } catch {
          return "invalid";
        }
      })() : ""
    },
    checks: {
      oauth,
      otp,
      smtp,
      resend,
      oauth_ready: oauthReady,
      email_ready: emailReady,
      overall_ready: oauthReady && otp.otp_secret_set && emailReady
    }
  });
}
