PRAGMA foreign_keys = ON;

-- IMPORTANT:
-- Keep in sync with src/services/storage-schema.ts (SCHEMA_STATEMENTS).
-- Any new table/column/index must be added to both places together.
--
-- WHEN CHANGING THIS:
-- - Also bump STORAGE_SCHEMA_VERSION in src/services/storage.ts.
-- - If the new table stores persistent data, update backup export/import.
-- - Keep src/services/storage-schema.ts idempotent for existing installs.

-- Add organization_id column to ciphers so shared items can be scoped to an org.
ALTER TABLE ciphers ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ciphers_org ON ciphers(organization_id);

-- A collection belongs to exactly one organization.
CREATE TABLE IF NOT EXISTS collections (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL,
  name             TEXT NOT NULL,   -- encrypted by the client
  external_id      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_collections_org ON collections(organization_id);

-- Which org members (organization_users.id) have access to which collection.
-- read_only = 1 means the member can read but not write items in this collection.
-- hide_passwords = 1 means password fields are masked for this member.
CREATE TABLE IF NOT EXISTS collection_users (
  collection_id    TEXT NOT NULL,
  org_user_id      TEXT NOT NULL,   -- references organization_users.id
  read_only        INTEGER NOT NULL DEFAULT 0,
  hide_passwords   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, org_user_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (org_user_id) REFERENCES organization_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_collection_users_org_user ON collection_users(org_user_id);

-- Maps cipher items to collections (many-to-many).
CREATE TABLE IF NOT EXISTS collection_items (
  collection_id  TEXT NOT NULL,
  cipher_id      TEXT NOT NULL,
  PRIMARY KEY (collection_id, cipher_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (cipher_id) REFERENCES ciphers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_collection_items_cipher ON collection_items(cipher_id);
