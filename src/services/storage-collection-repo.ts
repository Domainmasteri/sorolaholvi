import type { Collection, CollectionUser, CollectionResponse } from '../types';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface CollectionRow {
  id: string;
  organization_id: string;
  name: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CollectionAccessRow extends CollectionRow {
  read_only: number;
  hide_passwords: number;
}

function mapCollectionRow(row: CollectionRow): Collection {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    externalId: row.external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function collectionToResponse(
  collection: Collection,
  readOnly: boolean = false,
  hidePasswords: boolean = false
): CollectionResponse {
  return {
    id: collection.id,
    organizationId: collection.organizationId,
    name: collection.name,
    externalId: collection.externalId,
    readOnly,
    hidePasswords,
    object: 'collection',
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all collections in an organisation that the given org_user can see.
 * Owners and Admins (access_all = true) see every collection.
 * Regular members see only collections they are listed in collection_users.
 */
export async function getAccessibleCollections(
  db: D1Database,
  organizationId: string,
  orgUserId: string,
  accessAll: boolean
): Promise<Array<{ collection: Collection; readOnly: boolean; hidePasswords: boolean }>> {
  if (accessAll) {
    // Owner / Admin: return all collections with full access.
    const rows = await db
      .prepare(
        'SELECT id, organization_id, name, external_id, created_at, updated_at ' +
        'FROM collections WHERE organization_id = ? ORDER BY name'
      )
      .bind(organizationId)
      .all<CollectionRow>();
    return (rows.results ?? []).map((row) => ({
      collection: mapCollectionRow(row),
      readOnly: false,
      hidePasswords: false,
    }));
  }

  // Regular member: join with collection_users.
  const rows = await db
    .prepare(
      'SELECT c.id, c.organization_id, c.name, c.external_id, c.created_at, c.updated_at, ' +
      'cu.read_only, cu.hide_passwords ' +
      'FROM collections c ' +
      'INNER JOIN collection_users cu ON cu.collection_id = c.id ' +
      'WHERE c.organization_id = ? AND cu.org_user_id = ? ' +
      'ORDER BY c.name'
    )
    .bind(organizationId, orgUserId)
    .all<CollectionAccessRow>();

  return (rows.results ?? []).map((row) => ({
    collection: mapCollectionRow(row),
    readOnly: row.read_only === 1,
    hidePasswords: row.hide_passwords === 1,
  }));
}

/** Returns a single collection by ID, or null if not found. */
export async function getCollectionById(
  db: D1Database,
  collectionId: string
): Promise<Collection | null> {
  const row = await db
    .prepare(
      'SELECT id, organization_id, name, external_id, created_at, updated_at ' +
      'FROM collections WHERE id = ?'
    )
    .bind(collectionId)
    .first<CollectionRow>();
  return row ? mapCollectionRow(row) : null;
}

/** Inserts a new collection record. */
export async function insertCollection(db: D1Database, collection: Collection): Promise<void> {
  await db
    .prepare(
      'INSERT INTO collections(id, organization_id, name, external_id, created_at, updated_at) ' +
      'VALUES(?, ?, ?, ?, ?, ?)'
    )
    .bind(
      collection.id,
      collection.organizationId,
      collection.name,
      collection.externalId ?? null,
      collection.createdAt,
      collection.updatedAt
    )
    .run();
}

/** Updates an existing collection's name and externalId. */
export async function updateCollection(
  db: D1Database,
  collectionId: string,
  name: string,
  externalId: string | null,
  updatedAt: string
): Promise<void> {
  await db
    .prepare('UPDATE collections SET name = ?, external_id = ?, updated_at = ? WHERE id = ?')
    .bind(name, externalId ?? null, updatedAt, collectionId)
    .run();
}

/** Deletes a collection (cascades to collection_users and collection_items). */
export async function deleteCollection(db: D1Database, collectionId: string): Promise<void> {
  await db.prepare('DELETE FROM collections WHERE id = ?').bind(collectionId).run();
}

// ---------------------------------------------------------------------------
// collection_users management
// ---------------------------------------------------------------------------

/** Returns all collection_user grants for a given collection. */
export async function getCollectionUsers(
  db: D1Database,
  collectionId: string
): Promise<CollectionUser[]> {
  const rows = await db
    .prepare(
      'SELECT collection_id, org_user_id, read_only, hide_passwords ' +
      'FROM collection_users WHERE collection_id = ?'
    )
    .bind(collectionId)
    .all<{ collection_id: string; org_user_id: string; read_only: number; hide_passwords: number }>();
  return (rows.results ?? []).map((row) => ({
    collectionId: row.collection_id,
    orgUserId: row.org_user_id,
    readOnly: row.read_only === 1,
    hidePasswords: row.hide_passwords === 1,
  }));
}

/**
 * Replaces all collection_users rows for a given collection with the provided
 * list. Runs as a single D1 batch so the delete + inserts are atomic.
 */
export async function replaceCollectionUsers(
  db: D1Database,
  collectionId: string,
  users: CollectionUser[]
): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM collection_users WHERE collection_id = ?').bind(collectionId),
  ];
  for (const u of users) {
    stmts.push(
      db
        .prepare(
          'INSERT INTO collection_users(collection_id, org_user_id, read_only, hide_passwords) ' +
          'VALUES(?, ?, ?, ?)'
        )
        .bind(collectionId, u.orgUserId, u.readOnly ? 1 : 0, u.hidePasswords ? 1 : 0)
    );
  }
  await db.batch(stmts);
}

// ---------------------------------------------------------------------------
// collection_items (cipher ↔ collection mapping)
// ---------------------------------------------------------------------------

/** Returns all collection IDs a cipher belongs to. */
export async function getCollectionIdsForCipher(
  db: D1Database,
  cipherId: string
): Promise<string[]> {
  const rows = await db
    .prepare('SELECT collection_id FROM collection_items WHERE cipher_id = ?')
    .bind(cipherId)
    .all<{ collection_id: string }>();
  return (rows.results ?? []).map((r) => r.collection_id);
}

/**
 * Returns a map of cipher_id → collection_id[] for a set of cipher IDs.
 * Used to bulk-populate collectionIds on cipher list responses.
 */
export async function getCollectionIdsByCipherIds(
  db: D1Database,
  cipherIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (cipherIds.length === 0) return result;

  // D1 has a 100-parameter limit per statement; chunk if needed.
  const CHUNK = 90;
  for (let i = 0; i < cipherIds.length; i += CHUNK) {
    const chunk = cipherIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db
      .prepare(`SELECT collection_id, cipher_id FROM collection_items WHERE cipher_id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ collection_id: string; cipher_id: string }>();
    for (const row of rows.results ?? []) {
      const list = result.get(row.cipher_id) ?? [];
      list.push(row.collection_id);
      result.set(row.cipher_id, list);
    }
  }
  return result;
}

/**
 * Atomically replaces the collection membership for a cipher.
 * Deletes existing rows then inserts the new set inside a single D1 batch.
 */
export async function replaceCipherCollections(
  db: D1Database,
  cipherId: string,
  collectionIds: string[]
): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM collection_items WHERE cipher_id = ?').bind(cipherId),
  ];
  for (const colId of collectionIds) {
    stmts.push(
      db
        .prepare('INSERT OR IGNORE INTO collection_items(collection_id, cipher_id) VALUES(?, ?)')
        .bind(colId, cipherId)
    );
  }
  await db.batch(stmts);
}

// ---------------------------------------------------------------------------
// Accessible ciphers query (personal + org via collections)
// ---------------------------------------------------------------------------

/**
 * Returns the IDs of all ciphers accessible to a user:
 *   1. Personal ciphers (ciphers.user_id = userId, no organization_id)
 *   2. Org ciphers in collections where the user has access
 *      – Owners/Admins (access_all = 1) see all ciphers in their orgs.
 *      – Regular members see ciphers in their explicit collection grants.
 */
export async function getAccessibleCipherIds(
  db: D1Database,
  userId: string
): Promise<Set<string>> {
  const ids = new Set<string>();

  // Personal ciphers.
  const personal = await db
    .prepare('SELECT id FROM ciphers WHERE user_id = ? AND (organization_id IS NULL OR organization_id = \'\')')
    .bind(userId)
    .all<{ id: string }>();
  for (const row of personal.results ?? []) ids.add(row.id);

  // Org ciphers via access_all (Owner/Admin).
  const accessAllOrgs = await db
    .prepare(
      'SELECT c.id FROM ciphers c ' +
      'INNER JOIN organization_users ou ON ou.organization_id = c.organization_id ' +
      'WHERE ou.user_id = ? AND ou.access_all = 1 AND ou.status = 2 ' +
      '  AND c.organization_id IS NOT NULL'
    )
    .bind(userId)
    .all<{ id: string }>();
  for (const row of accessAllOrgs.results ?? []) ids.add(row.id);

  // Org ciphers via explicit collection grants.
  const collectionCiphers = await db
    .prepare(
      'SELECT ci.cipher_id AS id FROM collection_items ci ' +
      'INNER JOIN collection_users cu ON cu.collection_id = ci.collection_id ' +
      'INNER JOIN organization_users ou ON ou.id = cu.org_user_id ' +
      'WHERE ou.user_id = ? AND ou.status = 2'
    )
    .bind(userId)
    .all<{ id: string }>();
  for (const row of collectionCiphers.results ?? []) ids.add(row.id);

  return ids;
}
