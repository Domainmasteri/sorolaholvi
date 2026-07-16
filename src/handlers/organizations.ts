import type { Env, User, Organization, OrganizationUser, OrganizationResponse, OrgUserRole } from '../types';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the role is Owner (0) or Admin (1). */
function isOwnerOrAdmin(role: OrgUserRole): boolean {
  return role === 0 || role === 1;
}

/** Bitwarden-compatible organizationUserUserDetails response shape. */
interface OrgUserDetailsResponse {
  id: string;
  userId: string | null;
  name: string | null;
  email: string;
  twoFactorEnabled: boolean;
  status: number;
  type: number;
  accessAll: boolean;
  externalId: null;
  resetPasswordEnrolled: boolean;
  object: 'organizationUserUserDetails';
}

function orgUserToDetailsResponse(
  orgUser: OrganizationUser,
  name: string | null,
  twoFactorEnabled: boolean
): OrgUserDetailsResponse {
  return {
    id: orgUser.id,
    userId: orgUser.userId,
    name,
    email: orgUser.email,
    twoFactorEnabled,
    status: orgUser.status,
    type: orgUser.role,
    accessAll: orgUser.accessAll,
    externalId: null,
    resetPasswordEnrolled: false,
    object: 'organizationUserUserDetails',
  };
}

// ---------------------------------------------------------------------------
// GET /api/organizations/:id/users
// ---------------------------------------------------------------------------

/**
 * Returns all members of the organisation. Requires the requesting user to
 * be a member themselves (any role).
 */
export async function handleGetOrganizationUsers(
  _request: Request,
  env: Env,
  userId: string,
  organizationId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);

  // Verify the requesting user belongs to this org.
  const membership = await storage.getOrganizationByIdForUser(organizationId, userId);
  if (!membership) {
    return errorResponse('Not found', 404);
  }

  const details = await storage.getOrgUsersByOrgId(organizationId);
  const data = details.map(({ orgUser, name, twoFactorEnabled }) =>
    orgUserToDetailsResponse(orgUser, name, twoFactorEnabled)
  );
  return jsonResponse({ data, object: 'list', continuationToken: null });
}

// ---------------------------------------------------------------------------
// POST /api/organizations/:id/users/invite
// ---------------------------------------------------------------------------

/**
 * Invites one or more users to the organisation (Owner/Admin only).
 * Creates an organization_users record with status = 0 (Invited) for each email.
 *
 * Expected body:
 * {
 *   emails: string[];       // list of email addresses to invite
 *   type?: number;          // role (default: 2 = User)
 *   accessAll?: boolean;    // default false
 * }
 */
export async function handleInviteOrganizationUser(
  request: Request,
  env: Env,
  userId: string,
  organizationId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);

  const membership = await storage.getOrganizationByIdForUser(organizationId, userId);
  if (!membership) {
    return errorResponse('Not found', 404);
  }
  if (!isOwnerOrAdmin(membership.orgUser.role)) {
    return errorResponse('You do not have permission to invite members', 403);
  }

  let body: { emails?: unknown; type?: unknown; accessAll?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  if (!Array.isArray(body.emails) || body.emails.length === 0) {
    return errorResponse('At least one email is required', 400);
  }

  const emails = body.emails as unknown[];
  for (const e of emails) {
    if (typeof e !== 'string' || !e.trim()) {
      return errorResponse('Invalid email in list', 400);
    }
  }

  const role = (typeof body.type === 'number' && [0, 1, 2, 3, 4].includes(body.type)
    ? body.type
    : 2) as OrgUserRole;
  const accessAll = typeof body.accessAll === 'boolean' ? body.accessAll : false;
  const now = new Date().toISOString();

  for (const rawEmail of emails as string[]) {
    const email = rawEmail.trim().toLowerCase();

    // Skip if already a member.
    const existing = await storage.getOrgUserByOrgAndEmail(organizationId, email);
    if (existing) continue;

    const orgUser: OrganizationUser = {
      id: generateUUID(),
      organizationId,
      userId: null,
      email,
      role,
      status: 0,
      key: null,
      resetPasswordKey: null,
      accessAll,
      createdAt: now,
      updatedAt: now,
    };
    await storage.insertOrgUser(orgUser);
  }

  await writeAuditEvent(storage, {
    actorUserId: userId,
    action: 'organization.invite',
    category: 'data',
    level: 'info',
    targetType: 'organization',
    targetId: organizationId,
    metadata: {
      emails: (emails as string[]).map((e) => e.trim().toLowerCase()),
      ...auditRequestMetadata(request),
    },
  });

  return jsonResponse({});
}

// ---------------------------------------------------------------------------
// POST /api/organizations/:orgId/users/:orgUserId/accept
// ---------------------------------------------------------------------------

/**
 * Accepting user calls this endpoint after clicking the invite link.
 * The authenticated user must have the same email as the org_user record.
 * Sets status from 0 (Invited) → 1 (Accepted) and links the user account.
 *
 * Expected body (currently ignored – no email token required):
 * { token?: string }
 */
export async function handleAcceptOrganizationUserInvite(
  request: Request,
  env: Env,
  userId: string,
  currentUser: User,
  organizationId: string,
  orgUserId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);

  const orgUser = await storage.getOrgUserById(orgUserId);
  if (!orgUser || orgUser.organizationId !== organizationId) {
    return errorResponse('Not found', 404);
  }

  // The calling user's email must match the invite.
  if (orgUser.email.toLowerCase() !== currentUser.email.toLowerCase()) {
    return errorResponse('This invitation is for a different email address', 400);
  }

  if (orgUser.status !== 0) {
    return errorResponse('Invitation is no longer valid', 400);
  }

  const now = new Date().toISOString();
  await storage.acceptOrgUserInvite(orgUserId, userId, now);

  await writeAuditEvent(storage, {
    actorUserId: userId,
    action: 'organization.accept',
    category: 'data',
    level: 'info',
    targetType: 'organization',
    targetId: organizationId,
    metadata: { orgUserId, ...auditRequestMetadata(request) },
  });

  return jsonResponse({});
}

// ---------------------------------------------------------------------------
// POST /api/organizations/:orgId/users/:orgUserId/confirm
// ---------------------------------------------------------------------------

/**
 * Owner/Admin confirms an accepted member. The request body must contain
 * the org symmetric key encrypted with the member's RSA public key.
 * Sets status from 1 (Accepted) → 2 (Confirmed).
 *
 * Expected body:
 * { key: string }
 */
export async function handleConfirmOrganizationUser(
  request: Request,
  env: Env,
  userId: string,
  organizationId: string,
  orgUserId: string
): Promise<Response> {
  const storage = new StorageService(env.DB);

  const membership = await storage.getOrganizationByIdForUser(organizationId, userId);
  if (!membership) {
    return errorResponse('Not found', 404);
  }
  if (!isOwnerOrAdmin(membership.orgUser.role)) {
    return errorResponse('You do not have permission to confirm members', 403);
  }

  const orgUser = await storage.getOrgUserById(orgUserId);
  if (!orgUser || orgUser.organizationId !== organizationId) {
    return errorResponse('Not found', 404);
  }

  if (orgUser.status !== 1) {
    return errorResponse('User has not accepted the invitation', 400);
  }

  let body: { key?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  if (!body.key || typeof body.key !== 'string' || !body.key.trim()) {
    return errorResponse('Organization key is required', 400);
  }

  const now = new Date().toISOString();
  await storage.confirmOrgUser(orgUserId, body.key.trim(), now);

  await writeAuditEvent(storage, {
    actorUserId: userId,
    action: 'organization.confirm',
    category: 'data',
    level: 'info',
    targetType: 'organization',
    targetId: organizationId,
    metadata: { orgUserId, ...auditRequestMetadata(request) },
  });

  return jsonResponse({});
}
