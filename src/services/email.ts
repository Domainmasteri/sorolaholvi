// SMTP email service for Cloudflare Workers using cloudflare:sockets.
// Supports plain SMTP (port 25), STARTTLS (port 587), and implicit TLS (port 465).

import { connect } from 'cloudflare:sockets';
import type { EmailSettings } from '../utils/system-settings';

const SMTP_TIMEOUT_MS = 15_000;
const SMTP_ENCODING_LINE_LEN = 76;

function base64Encode(str: string): string {
  // btoa only handles latin1; encode as base64 of UTF-8 bytes
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64EncodeUint8(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64Lines(encoded: string): string {
  let out = '';
  for (let i = 0; i < encoded.length; i += SMTP_ENCODING_LINE_LEN) {
    out += encoded.slice(i, i + SMTP_ENCODING_LINE_LEN) + '\r\n';
  }
  return out;
}

function encodeSubject(subject: string): string {
  // RFC 2047 encoded-word for UTF-8 base64
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
}

function buildRawEmail(
  fromEmail: string,
  fromName: string,
  to: string,
  subject: string,
  html: string,
  text: string
): string {
  const boundary = `_bnd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const dateStr = new Date().toUTCString();
  const from = fromName
    ? `"${fromName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" <${fromEmail}>`
    : fromEmail;

  const htmlB64 = base64Lines(base64EncodeUint8(new TextEncoder().encode(html)));
  const textB64 = base64Lines(base64EncodeUint8(new TextEncoder().encode(text)));

  return (
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${encodeSubject(subject)}\r\n` +
    `Date: ${dateStr}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: multipart/alternative; boundary="${boundary}"\r\n` +
    `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n` +
    `\r\n` +
    `${textB64}` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n` +
    `\r\n` +
    `${htmlB64}` +
    `--${boundary}--\r\n`
  );
}

class SmtpClient {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = '';
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  constructor(readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array>) {
    this.reader = readable.getReader();
    this.writer = writable.getWriter();
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('SMTP timeout')), ms)
      ),
    ]);
  }

  private async readLine(): Promise<string> {
    while (true) {
      const idx = this.buffer.indexOf('\n');
      if (idx >= 0) {
        const line = this.buffer.slice(0, idx).replace(/\r$/, '');
        this.buffer = this.buffer.slice(idx + 1);
        return line;
      }
      const { done, value } = await this.withTimeout(this.reader.read(), SMTP_TIMEOUT_MS);
      if (done) throw new Error('SMTP connection closed unexpectedly');
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }

  async readResponse(): Promise<{ code: number; text: string }> {
    let code = 0;
    let text = '';
    while (true) {
      const line = await this.readLine();
      const lineCode = parseInt(line.slice(0, 3), 10);
      if (code === 0) code = lineCode;
      text += (text ? '\n' : '') + line.slice(4);
      if (line.length < 4 || line[3] === ' ') break;
    }
    return { code, text };
  }

  async send(data: string): Promise<void> {
    await this.withTimeout(this.writer.write(this.encoder.encode(data)), SMTP_TIMEOUT_MS);
  }

  async cmd(command: string): Promise<{ code: number; text: string }> {
    await this.send(command + '\r\n');
    return this.readResponse();
  }

  async close(): Promise<void> {
    try {
      await this.send('QUIT\r\n');
    } catch {
      // Best-effort quit
    }
    try { this.writer.close(); } catch { /* ignore */ }
    try { this.reader.cancel(); } catch { /* ignore */ }
  }

  replaceStreams(readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array>): void {
    try { this.reader.cancel(); } catch { /* ignore */ }
    try { this.writer.close(); } catch { /* ignore */ }
    this.buffer = '';
    this.reader = readable.getReader();
    this.writer = writable.getWriter();
  }
}

function assertSmtpOk(response: { code: number; text: string }, expected: number, label: string): void {
  if (response.code !== expected) {
    throw new Error(`SMTP ${label} failed (${response.code}): ${response.text}`);
  }
}

export async function sendSmtpEmail(
  settings: EmailSettings,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const host = settings.smtpHost.trim();
  const port = settings.smtpPort ?? 587;
  const useImplicitTls = port === 465;
  const useStartTls = !useImplicitTls && port !== 25;

  const socket = connect(
    { hostname: host, port },
    { secureTransport: useImplicitTls ? 'on' : useStartTls ? 'starttls' : 'off' }
  );

  const client = new SmtpClient(socket.readable, socket.writable);

  try {
    // Read SMTP greeting
    const greeting = await client.readResponse();
    if (greeting.code !== 220) {
      throw new Error(`SMTP greeting failed (${greeting.code}): ${greeting.text}`);
    }

    // EHLO
    let ehlo = await client.cmd('EHLO localhost');
    if (ehlo.code !== 250) {
      // Fallback to HELO for very old servers
      ehlo = await client.cmd('HELO localhost');
      if (ehlo.code !== 250) {
        throw new Error(`SMTP EHLO/HELO failed (${ehlo.code}): ${ehlo.text}`);
      }
    }

    // STARTTLS upgrade if needed
    if (useStartTls) {
      const starttls = await client.cmd('STARTTLS');
      assertSmtpOk(starttls, 220, 'STARTTLS');
      const upgraded = (socket as any).startTls() as { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
      client.replaceStreams(upgraded.readable, upgraded.writable);
      // Re-EHLO after TLS upgrade
      ehlo = await client.cmd('EHLO localhost');
      if (ehlo.code !== 250) {
        throw new Error(`SMTP EHLO after STARTTLS failed (${ehlo.code}): ${ehlo.text}`);
      }
    }

    // AUTH if credentials provided
    if (settings.smtpUsername) {
      const authPlain = '\0' + settings.smtpUsername + '\0' + settings.smtpPassword;
      const authB64 = base64Encode(authPlain);
      const auth = await client.cmd(`AUTH PLAIN ${authB64}`);
      if (auth.code !== 235) {
        // Try AUTH LOGIN as fallback
        const loginCmd = await client.cmd('AUTH LOGIN');
        if (loginCmd.code !== 334) {
          throw new Error(`SMTP AUTH failed (${auth.code}): ${auth.text}`);
        }
        const userResp = await client.cmd(btoa(settings.smtpUsername));
        if (userResp.code !== 334) {
          throw new Error(`SMTP AUTH LOGIN username failed (${userResp.code})`);
        }
        const passResp = await client.cmd(btoa(settings.smtpPassword));
        if (passResp.code !== 235) {
          throw new Error(`SMTP AUTH LOGIN password failed (${passResp.code})`);
        }
      }
    }

    // MAIL FROM
    const mailFrom = await client.cmd(`MAIL FROM:<${settings.fromEmail}>`);
    assertSmtpOk(mailFrom, 250, 'MAIL FROM');

    // RCPT TO
    const rcptTo = await client.cmd(`RCPT TO:<${to}>`);
    assertSmtpOk(rcptTo, 250, 'RCPT TO');

    // DATA
    const dataCmd = await client.cmd('DATA');
    assertSmtpOk(dataCmd, 354, 'DATA');

    // Send email body — escape leading dots per RFC 5321 §4.5.2
    const rawEmail = buildRawEmail(settings.fromEmail, settings.fromName, to, subject, html, text);
    const escaped = rawEmail.replace(/^\./mg, '..');
    await client.send(escaped + '\r\n.\r\n');

    const dataEnd = await client.readResponse();
    if (dataEnd.code !== 250) {
      throw new Error(`SMTP DATA end failed (${dataEnd.code}): ${dataEnd.text}`);
    }

    await client.close();
  } catch (err) {
    try { await client.close(); } catch { /* ignore */ }
    throw err;
  }
}
