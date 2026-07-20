// Email service for NodeWarden.
// Sends email via an HTTP-based relay using the configured SMTP settings.
// In Cloudflare Workers, raw TCP/SMTP is not available; configure smtpHost as
// an HTTPS endpoint for an HTTP-based SMTP relay (e.g. MailChannels, Resend,
// SendGrid, Mailgun, or any relay that accepts JSON POST with Basic auth).
//
// Request format posted to smtpHost:
//   POST <smtpHost>
//   Authorization: Basic base64(<username>:<password>)    (when credentials set)
//   Content-Type: application/json
//   {
//     "from": { "email": "<fromEmail>", "name": "<fromName>" },
//     "to": [{ "email": "<recipientEmail>" }],
//     "subject": "<subject>",
//     "html": "<htmlBody>",
//     "text": "<plainTextBody>"
//   }
//
// For MailChannels (native to Cloudflare Workers), set smtpHost to
// https://api.mailchannels.net/tx/v1/send and leave credentials empty.

import type { StorageService } from './storage';
import {
  EMAIL_ENABLED_CONFIG_KEY,
  EMAIL_FROM_EMAIL_CONFIG_KEY,
  EMAIL_FROM_NAME_CONFIG_KEY,
  EMAIL_SMTP_HOST_CONFIG_KEY,
  EMAIL_SMTP_USERNAME_CONFIG_KEY,
  EMAIL_SMTP_PASSWORD_CONFIG_KEY,
} from '../utils/system-settings';

export interface SmtpConfig {
  enabled: boolean;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpUsername: string;
  smtpPassword: string;
}

export async function getSmtpConfig(storage: StorageService): Promise<SmtpConfig> {
  const [enabled, fromEmail, fromName, smtpHost, smtpUsername, smtpPassword] = await Promise.all([
    storage.getConfigValue(EMAIL_ENABLED_CONFIG_KEY),
    storage.getConfigValue(EMAIL_FROM_EMAIL_CONFIG_KEY),
    storage.getConfigValue(EMAIL_FROM_NAME_CONFIG_KEY),
    storage.getConfigValue(EMAIL_SMTP_HOST_CONFIG_KEY),
    storage.getConfigValue(EMAIL_SMTP_USERNAME_CONFIG_KEY),
    storage.getConfigValue(EMAIL_SMTP_PASSWORD_CONFIG_KEY),
  ]);
  return {
    enabled: String(enabled || '').trim().toLowerCase() === 'true',
    fromEmail: String(fromEmail || '').trim(),
    fromName: String(fromName || '').trim(),
    smtpHost: String(smtpHost || '').trim(),
    smtpUsername: String(smtpUsername || '').trim(),
    smtpPassword: String(smtpPassword || '').trim(),
  };
}

function buildBasicAuth(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  return 'Basic ' + btoa(credentials);
}

/**
 * Send an email via the configured HTTP email relay.
 * Returns true on success, false if email is not configured or the relay call fails.
 */
export async function sendSmtpEmail(
  storage: StorageService,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<boolean> {
  const config = await getSmtpConfig(storage);
  if (!config.enabled) return false;
  if (!config.fromEmail || !config.smtpHost) return false;
  if (!config.smtpHost.startsWith('https://') && !config.smtpHost.startsWith('http://')) {
    // smtpHost is not an HTTP endpoint – cannot send via fetch
    console.warn('[email] smtpHost must be an HTTPS URL for HTTP relay-based email delivery');
    return false;
  }

  const payload: Record<string, unknown> = {
    from: { email: config.fromEmail, name: config.fromName || config.fromEmail },
    to: [{ email: to }],
    subject,
    html,
    text,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.smtpUsername && config.smtpPassword) {
    headers['Authorization'] = buildBasicAuth(config.smtpUsername, config.smtpPassword);
  }

  try {
    const response = await fetch(config.smtpHost, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[email] Relay returned non-OK status', response.status, body);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[email] Failed to send email:', error);
    return false;
  }
}

/** Generate a random numeric OTP of the given digit length. Uses rejection sampling to avoid modulo bias. */
export function generateOtpCode(digits: number = 6): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits);
  const range = max - min;
  // Largest multiple of range that fits in a Uint32 — reject values above this to eliminate modulo bias.
  const limit = 0x100000000 - (0x100000000 % range);
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return String(min + (value % range));
}

/** Mask an email address for display: a**b@example.com */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex < 1) return '***';
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  if (local.length <= 2) return `${local[0]}*${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}${domain}`;
}
