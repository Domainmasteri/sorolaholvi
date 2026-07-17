-- Migration: email OTP table and email 2FA flag on users
-- Applied automatically via storage-schema.ts on next request.

ALTER TABLE users ADD COLUMN email_two_factor_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS email_otps (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_otps_user_purpose ON email_otps(user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_email_otps_email_purpose ON email_otps(email, purpose);
CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps(expires_at);
