import tls from "node:tls";

/**
 * Minimal, dependency-free SMTP sender (implicit TLS, e.g. Gmail :465).
 *
 * Configure via env:
 *   SMTP_HOST       (default "smtp.gmail.com")
 *   SMTP_PORT       (default 465 — implicit TLS)
 *   SMTP_USER       the Gmail address
 *   SMTP_PASS       a Gmail *App Password* (16 chars, with 2FA enabled)
 *   SMTP_FROM       from address (default = SMTP_USER)
 *   SMTP_FROM_NAME  display name (default "Aquarich")
 *
 * If SMTP_USER/SMTP_PASS are absent the mailer runs in DEV mode: it logs the
 * message (including any OTP) to the server log instead of sending — so the
 * registration flow is fully testable before real credentials are added.
 */

const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || 465);
const USER = process.env.SMTP_USER || "";
const PASS = process.env.SMTP_PASS || "";
const FROM = process.env.SMTP_FROM || USER;
const FROM_NAME = process.env.SMTP_FROM_NAME || "Aquarich";

export const mailerConfigured = (): boolean => Boolean(USER && PASS);

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  if (!mailerConfigured()) {
    // DEV fallback — surface the content (incl. OTP codes) in the server log.
    console.log(
      `\n[mailer:dev] SMTP not configured — email NOT sent.\n` +
      `  to:      ${opts.to}\n` +
      `  subject: ${opts.subject}\n` +
      `  text:    ${opts.text || stripHtml(opts.html)}\n`,
    );
    return;
  }
  await smtpSend(opts);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildMessage(opts: MailOptions): string {
  const headers = [
    `From: ${FROM_NAME} <${FROM}>`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject, "utf8").toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
  ].join("\r\n");
  // base64-wrap at 76 cols. base64 alphabet never starts a line with ".", so no dot-stuffing needed.
  const body = Buffer.from(opts.html, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return `${headers}\r\n\r\n${body}`;
}

/** Reads one complete SMTP reply at a time (handles multi-line 250- responses). */
function makeReader(socket: tls.TLSSocket) {
  let buf = "";
  const waiters: Array<{ resolve: (v: { code: number; text: string }) => void }> = [];

  const complete = (): boolean => {
    if (!buf.endsWith("\r\n")) return false;
    const lines = buf.split("\r\n").filter((l) => l !== "");
    const last = lines[lines.length - 1];
    return /^\d{3} /.test(last); // final reply line: "250 ..." (space, not dash)
  };
  const flush = () => {
    while (waiters.length && complete()) {
      const text = buf;
      buf = "";
      const code = parseInt(text.slice(0, 3), 10);
      waiters.shift()!.resolve({ code, text });
    }
  };
  socket.on("data", (d: Buffer) => { buf += d.toString("utf8"); flush(); });

  return () => new Promise<{ code: number; text: string }>((resolve) => { waiters.push({ resolve }); flush(); });
}

function smtpSend(opts: MailOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: HOST, port: PORT, servername: HOST });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("SMTP timeout")); }, 20000);
    const fail = (e: Error) => { clearTimeout(timer); socket.destroy(); reject(e); };

    socket.on("error", fail);

    socket.once("secureConnect", async () => {
      try {
        const read = makeReader(socket);
        const send = (s: string) => socket.write(s + "\r\n");
        const expect = async (want: number) => {
          const { code, text } = await read();
          if (code !== want) throw new Error(`SMTP expected ${want}, got ${code}: ${text.trim()}`);
        };

        await expect(220);
        send(`EHLO aquarich`); await expect(250);
        send(`AUTH LOGIN`); await expect(334);
        send(Buffer.from(USER, "utf8").toString("base64")); await expect(334);
        send(Buffer.from(PASS, "utf8").toString("base64")); await expect(235);
        send(`MAIL FROM:<${FROM}>`); await expect(250);
        send(`RCPT TO:<${opts.to}>`); await expect(250);
        send(`DATA`); await expect(354);
        socket.write(buildMessage(opts) + "\r\n.\r\n"); await expect(250);
        send(`QUIT`);
        clearTimeout(timer);
        socket.end();
        resolve();
      } catch (e) {
        fail(e as Error);
      }
    });
  });
}
