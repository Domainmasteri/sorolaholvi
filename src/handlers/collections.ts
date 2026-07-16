import type { Collection, CollectionUser, CollectionResponse, Env, OrgUserRole } from '../types';
import { StorageService } from '../services/storage';
import { collectionToResponse } from '../services/storage-collection-repo';
import { jsonResponse, errorResponse } from '../utils/response';
import { generateUUID } from '../utils/uuid';
import { auditRequestMetadata, writeAuditEvent } from '../services/audit-events';

/** Returns true if the role is Owner (0) or Admin (1). */
function isOwnerOrAdmin(role: OrgUserRole): boolean {
  return role === 0 || role === 1;
}

// ---------------------------------------------------------------------------
// POST /api/organizations/:orgId/collections
// ---------------------------------------------------------------------------

/**
 * Creates a new collection inside the given organisation.
 * Only Owners and Admins may create collections.
 *
 * Expected body: { name: string; externalId?: string }
 */
export async function handleCreateCollection(
  request: Request,
  env: Env,
  userId: string,
  organizationId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);

  const membership = await storage.getOrganizationByIdForUser(organizationId, userId);
  if (!membership) return errorResponse('Not found', 404);
  if (!isOwnerOrAdmin(membership.orgUser.role)) {
    return errorResponse('You do not have permission to create collections', 403);
  }

  let body: { name?: unknown; externalId?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return errorResponse('Collection name is required', 400);
  }

  const now = new Date().toISOString();
  const collection: Collection = {
    id: generateUUID(),
    organizationId,
    name: body.name.trim(),
    externalId: typeof body.externalId === 'string' && body.externalId.trim()
      ? body.externalId.trim()
      : null,
    createdAt: now,
    updatedAt: now,
  };

  await storage.insertCollection(collection);

  await writeAuditEvent(storage, {
    actorUserId: userId,
    action: 'collection.create',
    category: 'data',
    level: 'info',
    targetType: 'collection',
    targetId: collection.id,
    metadata: auditRequestMetadata(request),
  });

  return jsonResponse(collectionToResponse(collection, false, false), 200);
}

// ---------------------------------------------------------------------------
// GET /api/organizations/:orgId/collections
// ---------------------------------------------------------------------------

/**
 * Lists all collections accessible to the requesting user.
 * Owners and Admins see all collections with full access.
 * Regular members see only collections they are explicitly granted.
 */
export async function handleGetCollections(
  _request: Request,
  env: Env,
  userId: string,
  organizationId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);

  const membership = await storage.getOrganizationByIdForUser(organizationId, userId);
  if (!membership) return errorResponse('Not found', 404);

  const items = await storage.getAccessibleCollections(
    organizationId,
    membership.orgUser.id,
    membership.orgUser.accessAll || isOwnerOrAdmin(membership.orgUser.role)
  );

  const data: CollectionResponse[] = items.map(({ collection, readOnly, hidePasswords }) =>
    collectionToResponse(collection, readOnly, hidePasswords)
  );

  return jsonResponse({ data, object: 'list', continuationToken: null });
}

// ---------------------------------------------------------------------------
// PUT /api/organizations/:orgId/collections/:colId
// ---------------------------------------------------------------------------

/**
 * Updates a collection's name and optionally externalId.
 * Only Owners and Admins may update collections.
 *
 * Expected body: { name: string; externalId?: string }
 */
export async function handleUpdateCollection(
  request: Request,
  env: Env,
  userId: string,
  organizationId: string,
  collectionId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);

  const membership = await storage.getOrganizationByIdForUser(organizationId, userId);
  if (!membership) return errorResponse('Not found', 404);
  if (!isOwnerOrAdmin(membership.orgUser.role)) {
    return errorResponse('You do not have permission to update collections', 403);
  }

  const collection = await storage.getCollectionById(collectionId);
  if (!collection || collection.organizationId !== organizationId) {
    return errorResponse('Not found', 404);
  }

  let body: { name?: unknown; externalId?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return errorResponse('Collection name is required', 400);
  }

  const externalId = typeof body.externalId === 'string' && body.externalId.trim()
    ? body.externalId.trim()
    : null;
  const now = new Date().toISOString();

  await storage.updateCollection(collectionId, body.name.trim(), externalId, now);

  await writeAuditEvent(storage, {
    actorUserId: userId,
    action: 'collection.update',
    category: 'data',
    level: 'info',
    targetType: 'collection',
    targetId: collectionId,
    metadata: auditRequestMetadata(request),
  });

  const updated: Collection = {
    ...collection,
    name: body.name.trim(),
    externalId,
    updatedAt: now,
  };
  return jsonResponse(collectionToResponse(updated, false, false), 200);
}

// ---------------------------------------------------------------------------
// DELETE /api/organizations/:orgId/collections/:colId
// ---------------------------------------------------------------------------

/**
 * Deletes a collection and all its cipher associations.
 * Only Owners and Admins may delete collections.
 */
export async function handleDeleteCollection(
  request: Request,
  env: Env,
  userId: string,
  organizationId: string,
  collectionId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);

  const membership = await storage.getOrganizationByIdForUser(organizationId, userId);
  if (!membership) return errorResponse('Not found', 404);
  if (!isOwnerOrAdmin(membership.orgUser.role)) {
    return errorResponse('You do not have permission to delete collections', 403);
  }

  const collection = await storage.getCollectionById(collectionId);
  if (!collection || collection.organizationId !== organizationId) {
    return errorResponse('Not found', 404);
  }

  await storage.deleteCollection(collectionId);

  await writeAuditEvent(storage, {
    actorUserId: userId,
    action: 'collection.delete',
    category: 'data',
    level: 'security',
    targetType: 'collection',
    targetId: collectionId,
    metadata: auditRequestMetadata(request),
  });

  return jsonResponse({});
}

// ---------------------------------------------------------------------------
// PUT /api/organizations/:orgId/collections/:colId/users
// ---------------------------------------------------------------------------

/**
 * Replaces the collection access grants for a collection.
 * Only Owners and Admins may manage access.
 *
 * Expected body:
 * Array of { orgUserId: string; readOnly?: boolean; hidePasswords?: boolean }
 * or a plain array of orgUserId strings for simple full-access grants.
 */
export async function handleUpdateCollectionUsers(
  request: Request,
  env: Env,
  userId: string,
  organizationId: string,
  collectionId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);

  const membership = await storage.getOrganizationByIdForUser(organizationId, userId);
  if (!membership) return errorResponse('Not found', 404);
  if (!isOwnerOrAdmin(membership.orgUser.role)) {
    return errorResponse('You do not have permission to manage collection access', 403);
  }

  const collection = await storage.getCollectionById(collectionId);
  if (!collection || collection.organizationId !== organizationId) {
    return errorResponse('Not found', 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  if (!Array.isArray(body)) {
    return errorResponse('Expected an array of user grants', 400);
  }

  const users: CollectionUser[] = [];
  for (const item of body) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    // Accept { orgUserId, id } interchangeably, and also plain strings.
    const orgUserId = typeof entry === 'string'
      ? entry
      : String(entry.orgUserId ?? entry.id ?? '').trim();
    if (!orgUserId) continue;
    users.push({
      collectionId,
      orgUserId,
      readOnly: typeof entry.readOnly === 'boolean' ? entry.readOnly : false,
      hidePasswords: typeof entry.hidePasswords === 'boolean' ? entry.hidePasswords : false,
    });
  }

  await storage.replaceCollectionUsers(collectionId, users);

  await writeAuditEvent(storage, {
    actorUserId: userId,
    action: 'collection.users.update',
    category: 'data',
    level: 'info',
    targetType: 'collection',
    targetId: collectionId,
    metadata: { userCount: users.length, ...auditRequestMetadata(request) },
  });

  return jsonResponse({});
}
