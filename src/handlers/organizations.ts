import type { Env, User, Organization, OrganizationUser, OrganizationResponse } from '../types';
import { StorageService } from '../services/storage';
import { jsonResponse, errorResponse } from '../utils/response';
import { generateUUID } from '../utils/uuid';
import { auditRequestMetadata, writeAuditEvent } from '../services/audit-events';

/** Convert internal models to the Bitwarden profileOrganization response shape. */
function organizationToResponse(org: Organization, orgUser: OrganizationUser): OrganizationResponse {
  return {
    id: org.id,
    name: org.name,
    billingEmail: org.billingEmail,
    plan: 'free',
    planType: 0,
    seats: 2,
    maxCollections: null,
    maxStorageGb: null,
    use2fa: false,
    useDirectory: false,
    useEvents: false,
    useGroups: false,
    useTotp: false,
    usePolicies: false,
    useSso: false,
    useKeyConnector: false,
    useScim: false,
    useCustomPermissions: false,
    useResetPassword: false,
    useSecretsManager: false,
    selfHost: false,
    enabled: org.enabled,
    status: orgUser.status,
    type: orgUser.role,
    key: orgUser.key,
    hasPublicAndPrivateKeys: !!(org.publicKey && org.privateKey),
    resetPasswordEnrolled: false,
    userId: orgUser.userId,
    identifier: null,
    noAdminAccess: false,
    isBillable: false,
    object: 'profileOrganization',
  };
}

/**
 * GET /api/organizations
 *
 * Returns all organizations the current user belongs to, formatted as a
 * Bitwarden-compatible list response.
 */
export async function handleGetOrganizations(
  _request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);
  const memberships = await storage.getOrganizationsByUserId(userId);
  const data = memberships.map(({ org, orgUser }) => organizationToResponse(org, orgUser));
  return jsonResponse({ data, object: 'list', continuationToken: null });
}

/**
 * GET /api/organizations/:id
 *
 * Returns a single organization by ID, but only if the current user is a
 * member of that organization. Returns 404 otherwise.
 */
export async function handleGetOrganization(
  _request: Request,
  env: Env,
  userId: string,
  organizationId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);
  const membership = await storage.getOrganizationByIdForUser(organizationId, userId);
  if (!membership) {
    return errorResponse('Not found', 404);
  }
  return jsonResponse(organizationToResponse(membership.org, membership.orgUser));
}

/**
 * POST /api/organizations
 *
 * Creates a new organization and immediately adds the requesting user as the
 * confirmed Owner (role = 0). The org record and the owner membership are
 * inserted atomically via a D1 batch.
 *
 * Expected request body:
 * {
 *   name: string              // organization name (may be encrypted by the client)
 *   billingEmail?: string     // contact e-mail
 *   key: string               // org symmetric key encrypted with owner's RSA public key
 *   keys?: {
 *     publicKey?: string         // org RSA public key
 *     encryptedPrivateKey?: string // org RSA private key encrypted with org symmetric key
 *   }
 *   collectionName?: string   // encrypted default collection name (reserved for future use)
 *   planType?: number         // plan type requested by the client (ignored; always free)
 * }
 */
export async function handleCreateOrganization(
  request: Request,
  env: Env,
  userId: string,
  currentUser: User
): Promise<Response> {
  const storage = new StorageService(env.DB);

  let body: {
    name?: unknown;
    billingEmail?: unknown;
    key?: unknown;
    keys?: {
      publicKey?: unknown;
      encryptedPrivateKey?: unknown;
    };
    collectionName?: unknown;
    planType?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return errorResponse('Organization name is required', 400);
  }
  if (!body.key || typeof body.key !== 'string' || !body.key.trim()) {
    return errorResponse('Organization key is required', 400);
  }

  const now = new Date().toISOString();

  const org: Organization = {
    id: generateUUID(),
    name: body.name.trim(),
    billingEmail: typeof body.billingEmail === 'string' && body.billingEmail.trim()
      ? body.billingEmail.trim()
      : null,
    plan: 'free',
    publicKey: typeof body.keys?.publicKey === 'string' && body.keys.publicKey.trim()
      ? body.keys.publicKey.trim()
      : null,
    privateKey: typeof body.keys?.encryptedPrivateKey === 'string' && body.keys.encryptedPrivateKey.trim()
      ? body.keys.encryptedPrivateKey.trim()
      : null,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  // Owner (role = 0) is immediately confirmed (status = 2) and has access to
  // all collections (accessAll = true).
  const orgUser: OrganizationUser = {
    id: generateUUID(),
    organizationId: org.id,
    userId,
    email: currentUser.email,
    role: 0,
    status: 2,
    key: body.key.trim(),
    resetPasswordKey: null,
    accessAll: true,
    createdAt: now,
    updatedAt: now,
  };

  await storage.createOrganizationWithOwner(org, orgUser);

  await writeAuditEvent(storage, {
    actorUserId: userId,
    action: 'organization.create',
    category: 'data',
    level: 'info',
    targetType: 'organization',
    targetId: org.id,
    metadata: auditRequestMetadata(request),
  });

  return jsonResponse(organizationToResponse(org, orgUser), 200);
}
