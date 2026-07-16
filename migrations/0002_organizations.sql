PRAGMA foreign_keys = ON;

-- IMPORTANT:
-- Keep in sync with src/services/storage-schema.ts (SCHEMA_STATEMENTS).
-- Any new table/column/index must be added to both places together.
--
-- WHEN CHANGING THIS:
-- - Also bump STORAGE_SCHEMA_VERSION in src/services/storage.ts.
-- - If the new table stores persistent data, update backup export/import.
-- - Keep src/services/storage-schema.ts idempotent for existing installs.

CREATE TABLE IF NOT EXISTS organizations (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  billing_email TEXT,
  plan         TEXT NOT NULL DEFAULT 'free',
  -- RSA key pair for the organization (used to share the org symmetric key with new members)
  public_key   TEXT,
  private_key  TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);

-- role values (match Bitwarden integer constants):
--   0 = Owner, 1 = Admin, 2 = User, 3 = Manager, 4 = Custom
-- status values (match Bitwarden integer constants):
--   -1 = Revoked, 0 = Invited, 1 = Accepted, 2 = Confirmed
CREATE TABLE IF NOT EXISTS organization_users (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT NOT NULL,
  user_id             TEXT,
  email               TEXT NOT NULL,
  role                INTEGER NOT NULL DEFAULT 2,
  status              INTEGER NOT NULL DEFAULT 0,
  -- The organization's symmetric key, encrypted with this user's RSA public key.
  -- NULL until the member is confirmed (status = 2).
  key                 TEXT,
  reset_password_key  TEXT,
  -- 1 = user can access all collections; 0 = access via collection_users only
  access_all          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- SQLite treats each NULL as distinct in UNIQUE constraints, so multiple invited
-- (user_id = NULL) rows per organization are allowed while confirmed members are
-- unique per organization.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_users_org_user
  ON organization_users(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_org_users_org_status
  ON organization_users(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_org_users_user
  ON organization_users(user_id);
