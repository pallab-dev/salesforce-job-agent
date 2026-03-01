import net from "node:net";
import tls from "node:tls";

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

type SmtpOptions = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  text: string;
};

type SmtpSocket = net.Socket | tls.TLSSocket;

async function waitForResponse(socket: SmtpSocket): Promise<{ code: number; message: string }> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let timeout: NodeJS.Timeout | null = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP response timeout"));
    }, 12000);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) {
        return;
      }
      const last = lines[lines.length - 1];
      if (!/^\d{3}\s/.test(last)) {
        return;
      }
      cleanup();
      const code = Number(last.slice(0, 3));
      resolve({ code, message: lines.join("\n") });
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function sendCommand(
  socket: SmtpSocket,
  command: string,
  expectedCodes: number[]
): Promise<{ code: number; message: string }> {
  socket.write(`${command}\r\n`);
  const response = await waitForResponse(socket);
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed (${command}): ${response.message}`);
  }
  return response;
}

async function openSmtpConnection(host: string, port: number, secure: boolean): Promise<SmtpSocket> {
  if (secure) {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host, port, servername: host }, () => resolve(socket));
      socket.once("error", reject);
    });
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => resolve(socket));
    socket.once("error", reject);
  });
}

function buildMessage(opts: SmtpOptions): string {
  const subject = opts.subject.replace(/[\r\n]+/g, " ").trim();
  const from = opts.from.replace(/[\r\n]+/g, " ").trim();
  const to = opts.to.replace(/[\r\n]+/g, " ").trim();
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.text,
    ""
  ].join("\r\n");
}

export async function sendSmtpMail(options: SmtpOptions): Promise<void> {
  const socket = await openSmtpConnection(options.host, options.port, options.secure);
  try {
    const greet = await waitForResponse(socket);
    if (greet.code !== 220) {
      throw new Error(`SMTP greeting failed: ${greet.message}`);
    }

    await sendCommand(socket, `EHLO ${options.host}`, [250]);
    await sendCommand(socket, "AUTH LOGIN", [334]);
    await sendCommand(socket, encodeBase64(options.username), [334]);
    await sendCommand(socket, encodeBase64(options.password), [235]);
    await sendCommand(socket, `MAIL FROM:<${options.from}>`, [250]);
    await sendCommand(socket, `RCPT TO:<${options.to}>`, [250, 251]);
    await sendCommand(socket, "DATA", [354]);
    socket.write(`${buildMessage(options)}\r\n.\r\n`);
    const dataResp = await waitForResponse(socket);
    if (dataResp.code !== 250) {
      throw new Error(`SMTP DATA failed: ${dataResp.message}`);
    }
    await sendCommand(socket, "QUIT", [221]);
  } finally {
    socket.end();
  }
}
