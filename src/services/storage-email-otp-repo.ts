// Email OTP storage repository.
// Covers both email 2FA login codes and registration email verification tokens.

export type EmailOtpPurpose = 'two_factor_login' | 'registration_verify';

export interface EmailOtp {
  id: string;
  userId: string | null;
  email: string;
  code: string;
  purpose: EmailOtpPurpose;
  expiresAt: number;
  createdAt: number;
}

export async function saveEmailOtp(db: D1Database, otp: EmailOtp): Promise<void> {
  await db
    .prepare(
      'INSERT INTO email_otps(id, user_id, email, code, purpose, expires_at, created_at) VALUES(?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at'
    )
    .bind(otp.id, otp.userId, otp.email, otp.code, otp.purpose, otp.expiresAt, otp.createdAt)
    .run();
}

export async function getActiveEmailOtp(
  db: D1Database,
  id: string,
  purpose: EmailOtpPurpose,
  nowMs: number
): Promise<EmailOtp | null> {
  const row = await db
    .prepare(
      'SELECT id, user_id, email, code, purpose, expires_at, created_at FROM email_otps WHERE id = ? AND purpose = ? AND expires_at > ?'
    )
    .bind(id, purpose, nowMs)
    .first<any>();
  if (!row) return null;
  return mapRow(row);
}

export async function getActiveEmailOtpByUserAndPurpose(
  db: D1Database,
  userId: string,
  purpose: EmailOtpPurpose,
  nowMs: number
): Promise<EmailOtp | null> {
  const row = await db
    .prepare(
      'SELECT id, user_id, email, code, purpose, expires_at, created_at FROM email_otps WHERE user_id = ? AND purpose = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
    )
    .bind(userId, purpose, nowMs)
    .first<any>();
  if (!row) return null;
  return mapRow(row);
}

export async function deleteEmailOtp(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM email_otps WHERE id = ?').bind(id).run();
}

export async function deleteEmailOtpsByUserAndPurpose(
  db: D1Database,
  userId: string,
  purpose: EmailOtpPurpose
): Promise<void> {
  await db
    .prepare('DELETE FROM email_otps WHERE user_id = ? AND purpose = ?')
    .bind(userId, purpose)
    .run();
}

export async function deleteEmailOtpsByEmailAndPurpose(
  db: D1Database,
  email: string,
  purpose: EmailOtpPurpose
): Promise<void> {
  await db
    .prepare('DELETE FROM email_otps WHERE email = ? AND purpose = ?')
    .bind(email, purpose)
    .run();
}

export async function pruneExpiredEmailOtps(db: D1Database, nowMs: number): Promise<void> {
  await db.prepare('DELETE FROM email_otps WHERE expires_at < ?').bind(nowMs).run();
}

function mapRow(row: any): EmailOtp {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    email: row.email,
    code: row.code,
    purpose: row.purpose,
    expiresAt: Number(row.expires_at),
    createdAt: Number(row.created_at),
  };
}
