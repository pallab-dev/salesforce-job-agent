import { sendSmtpMail } from "./smtp";

type DeliveryResult = {
  delivered: boolean;
  provider: "resend" | "postmark" | "sendgrid" | "smtp" | "none";
  reason?: string;
};

type SendOtpInput = {
  to: string;
  username: string;
  otp: string;
};

function providerName(): string {
  return (process.env.EMAIL_PROVIDER || "smtp").trim().toLowerCase();
}

function buildBody(username: string, otp: string): string {
  return `Hi ${username},\n\nYour AI Job Agent verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\n- AI Job Agent`;
}

async function sendResendMail(input: SendOtpInput): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = process.env.RESEND_FROM?.trim() || process.env.SMTP_FROM?.trim() || "";
  if (!apiKey || !from) {
    return { delivered: false, provider: "resend", reason: "resend_not_configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "AI Job Agent verification code",
      text: buildBody(input.username, input.otp)
    })
  });

  if (!response.ok) {
    const body = await response.text();
    return { delivered: false, provider: "resend", reason: `resend_error:${body.slice(0, 200)}` };
  }

  return { delivered: true, provider: "resend" };
}

async function sendPostmarkMail(input: SendOtpInput): Promise<DeliveryResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim() || "";
  const from = process.env.POSTMARK_FROM?.trim() || process.env.SMTP_FROM?.trim() || "";
  if (!token || !from) {
    return { delivered: false, provider: "postmark", reason: "postmark_not_configured" };
  }

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token
    },
    body: JSON.stringify({
      From: from,
      To: input.to,
      Subject: "AI Job Agent verification code",
      TextBody: buildBody(input.username, input.otp),
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM?.trim() || "outbound"
    })
  });

  if (!response.ok) {
    const body = await response.text();
    return { delivered: false, provider: "postmark", reason: `postmark_error:${body.slice(0, 200)}` };
  }

  return { delivered: true, provider: "postmark" };
}

async function sendSendGridMail(input: SendOtpInput): Promise<DeliveryResult> {
  const apiKey = process.env.SENDGRID_API_KEY?.trim() || "";
  const from = process.env.SENDGRID_FROM?.trim() || process.env.SMTP_FROM?.trim() || "";
  if (!apiKey || !from) {
    return { delivered: false, provider: "sendgrid", reason: "sendgrid_not_configured" };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: from },
      subject: "AI Job Agent verification code",
      content: [{ type: "text/plain", value: buildBody(input.username, input.otp) }]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    return { delivered: false, provider: "sendgrid", reason: `sendgrid_error:${body.slice(0, 200)}` };
  }

  return { delivered: true, provider: "sendgrid" };
}

async function sendSmtp(input: SendOtpInput): Promise<DeliveryResult> {
  const host = process.env.SMTP_HOST?.trim() || "";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER?.trim() || "";
  const pass = process.env.SMTP_PASS?.trim() || "";
  const from = process.env.SMTP_FROM?.trim() || user;
  const secure = (process.env.SMTP_SECURE || "true").trim().toLowerCase() !== "false";

  if (!host || !user || !pass || !from || !Number.isFinite(port) || port <= 0) {
    return { delivered: false, provider: "smtp", reason: "smtp_not_configured" };
  }

  await sendSmtpMail({
    host,
    port,
    secure,
    username: user,
    password: pass,
    from,
    to: input.to,
    subject: "AI Job Agent verification code",
    text: buildBody(input.username, input.otp)
  });

  return { delivered: true, provider: "smtp" };
}

export async function sendOtpEmail(input: SendOtpInput): Promise<DeliveryResult> {
  const provider = providerName();

  if (provider === "resend") {
    return sendResendMail(input);
  }
  if (provider === "postmark") {
    return sendPostmarkMail(input);
  }
  if (provider === "sendgrid") {
    return sendSendGridMail(input);
  }
  if (provider === "smtp") {
    return sendSmtp(input);
  }

  return { delivered: false, provider: "none", reason: `unknown_provider:${provider}` };
}
