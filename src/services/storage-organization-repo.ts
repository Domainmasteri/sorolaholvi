import type { Organization, OrganizationUser, OrgUserRole, OrgUserStatus } from '../types';

/**
 * Atomically inserts a new organization and its first (owner) member using a
 * D1 batch, so both writes either succeed together or are rolled back.
 */
export async function createOrganizationWithOwner(
  db: D1Database,
  org: Organization,
  orgUser: OrganizationUser
): Promise<void> {
  const insertOrg = db
    .prepare(
      'INSERT INTO organizations(id, name, billing_email, plan, public_key, private_key, enabled, created_at, updated_at) ' +
      'VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      org.id,
      org.name,
      org.billingEmail ?? null,
      org.plan,
      org.publicKey ?? null,
      org.privateKey ?? null,
      org.enabled ? 1 : 0,
      org.createdAt,
      org.updatedAt
    );

  const insertOrgUser = db
    .prepare(
      'INSERT INTO organization_users(id, organization_id, user_id, email, role, status, key, reset_password_key, access_all, created_at, updated_at) ' +
      'VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      orgUser.id,
      orgUser.organizationId,
      orgUser.userId ?? null,
      orgUser.email,
      orgUser.role,
      orgUser.status,
      orgUser.key ?? null,
      orgUser.resetPasswordKey ?? null,
      orgUser.accessAll ? 1 : 0,
      orgUser.createdAt,
      orgUser.updatedAt
    );

  await db.batch([insertOrg, insertOrgUser]);
}

interface OrgWithMembership {
  org_id: string;
  org_name: string;
  billing_email: string | null;
  plan: string;
  public_key: string | null;
  private_key: string | null;
  enabled: number;
  org_created_at: string;
  org_updated_at: string;
  ou_id: string;
  organization_id: string;
  user_id: string | null;
  email: string;
  role: number;
  status: number;
  key: string | null;
  reset_password_key: string | null;
  access_all: number;
  ou_created_at: string;
  ou_updated_at: string;
}

function rowToOrgAndUser(row: OrgWithMembership): { org: Organization; orgUser: OrganizationUser } {
  return {
    org: {
      id: row.org_id,
      name: row.org_name,
      billingEmail: row.billing_email,
      plan: row.plan,
      publicKey: row.public_key,
      privateKey: row.private_key,
      enabled: row.enabled === 1,
      createdAt: row.org_created_at,
      updatedAt: row.org_updated_at,
    },
    orgUser: {
      id: row.ou_id,
      organizationId: row.organization_id,
      userId: row.user_id,
      email: row.email,
      role: row.role as OrgUserRole,
      status: row.status as OrgUserStatus,
      key: row.key,
      resetPasswordKey: row.reset_password_key,
      accessAll: row.access_all === 1,
      createdAt: row.ou_created_at,
      updatedAt: row.ou_updated_at,
    },
  };
}

const ORG_JOIN_SELECT =
  'SELECT o.id AS org_id, o.name AS org_name, o.billing_email, o.plan, o.public_key, o.private_key, ' +
  'o.enabled, o.created_at AS org_created_at, o.updated_at AS org_updated_at, ' +
  'ou.id AS ou_id, ou.organization_id, ou.user_id, ou.email, ou.role, ou.status, ou.key, ' +
  'ou.reset_password_key, ou.access_all, ou.created_at AS ou_created_at, ou.updated_at AS ou_updated_at ' +
  'FROM organizations o INNER JOIN organization_users ou ON ou.organization_id = o.id ';

/**
 * Returns all organizations the given user belongs to, along with their
 * membership record in each organization.
 */
export async function getOrganizationsByUserId(
  db: D1Database,
  userId: string
): Promise<Array<{ org: Organization; orgUser: OrganizationUser }>> {
  const rows = await db
    .prepare(ORG_JOIN_SELECT + 'WHERE ou.user_id = ?')
    .bind(userId)
    .all<OrgWithMembership>();
  return (rows.results ?? []).map(rowToOrgAndUser);
}

/**
 * Returns a single organization together with the requesting user's membership
 * record, or null if the user is not a member of that organization.
 */
export async function getOrganizationByIdForUser(
  db: D1Database,
  organizationId: string,
  userId: string
): Promise<{ org: Organization; orgUser: OrganizationUser } | null> {
  const row = await db
    .prepare(ORG_JOIN_SELECT + 'WHERE o.id = ? AND ou.user_id = ?')
    .bind(organizationId, userId)
    .first<OrgWithMembership>();
  if (!row) return null;
  return rowToOrgAndUser(row);
}

// ---------------------------------------------------------------------------
// Organization user management
// ---------------------------------------------------------------------------

/** Slim row returned by the org-user list query (includes user display info). */
interface OrgUserListRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  email: string;
  role: number;
  status: number;
  key: string | null;
  reset_password_key: string | null;
  access_all: number;
  created_at: string;
  updated_at: string;
  // joined from users table (may be null for pending invites)
  user_name: string | null;
  totp_secret: string | null;
}

export interface OrgUserDetails {
  orgUser: OrganizationUser;
  name: string | null;
  twoFactorEnabled: boolean;
}

/**
 * Returns all organization_user records for a given org, joined with the
 * users table for display name and 2FA status.
 */
export async function getOrgUsersByOrgId(
  db: D1Database,
  organizationId: string
): Promise<OrgUserDetails[]> {
  const rows = await db
    .prepare(
      'SELECT ou.id, ou.organization_id, ou.user_id, ou.email, ou.role, ou.status, ou.key, ' +
      'ou.reset_password_key, ou.access_all, ou.created_at, ou.updated_at, ' +
      'u.name AS user_name, u.totp_secret ' +
      'FROM organization_users ou ' +
      'LEFT JOIN users u ON u.id = ou.user_id ' +
      'WHERE ou.organization_id = ?'
    )
    .bind(organizationId)
    .all<OrgUserListRow>();

  return (rows.results ?? []).map((row) => ({
    orgUser: {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      email: row.email,
      role: row.role as OrgUserRole,
      status: row.status as OrgUserStatus,
      key: row.key,
      resetPasswordKey: row.reset_password_key,
      accessAll: row.access_all === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    name: row.user_name ?? null,
    twoFactorEnabled: !!row.totp_secret,
  }));
}

interface OrgUserRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  email: string;
  role: number;
  status: number;
  key: string | null;
  reset_password_key: string | null;
  access_all: number;
  created_at: string;
  updated_at: string;
}

function mapOrgUserRow(row: OrgUserRow): OrganizationUser {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    email: row.email,
    role: row.role as OrgUserRole,
    status: row.status as OrgUserStatus,
    key: row.key,
    resetPasswordKey: row.reset_password_key,
    accessAll: row.access_all === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Returns an org_user record by its own ID, or null if not found. */
export async function getOrgUserById(
  db: D1Database,
  orgUserId: string
): Promise<OrganizationUser | null> {
  const row = await db
    .prepare(
      'SELECT id, organization_id, user_id, email, role, status, key, ' +
      'reset_password_key, access_all, created_at, updated_at ' +
      'FROM organization_users WHERE id = ?'
    )
    .bind(orgUserId)
    .first<OrgUserRow>();
  if (!row) return null;
  return mapOrgUserRow(row);
}

/** Returns an org_user record by org ID and email, or null if not found. */
export async function getOrgUserByOrgAndEmail(
  db: D1Database,
  organizationId: string,
  email: string
): Promise<OrganizationUser | null> {
  const row = await db
    .prepare(
      'SELECT id, organization_id, user_id, email, role, status, key, ' +
      'reset_password_key, access_all, created_at, updated_at ' +
      'FROM organization_users WHERE organization_id = ? AND email = ?'
    )
    .bind(organizationId, email.toLowerCase())
    .first<OrgUserRow>();
  if (!row) return null;
  return mapOrgUserRow(row);
}

/** Inserts a new org_user invite record. */
export async function insertOrgUser(
  db: D1Database,
  orgUser: OrganizationUser
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO organization_users(id, organization_id, user_id, email, role, status, key, ' +
      'reset_password_key, access_all, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      orgUser.id,
      orgUser.organizationId,
      orgUser.userId ?? null,
      orgUser.email,
      orgUser.role,
      orgUser.status,
      orgUser.key ?? null,
      orgUser.resetPasswordKey ?? null,
      orgUser.accessAll ? 1 : 0,
      orgUser.createdAt,
      orgUser.updatedAt
    )
    .run();
}

/**
 * Transitions an invited org_user to Accepted (status = 1).
 * Links the user account ID and records the timestamp.
 */
export async function acceptOrgUserInvite(
  db: D1Database,
  orgUserId: string,
  userId: string,
  updatedAt: string
): Promise<void> {
  await db
    .prepare(
      'UPDATE organization_users SET user_id = ?, status = 1, updated_at = ? WHERE id = ?'
    )
    .bind(userId, updatedAt, orgUserId)
    .run();
}

/**
 * Transitions an accepted org_user to Confirmed (status = 2).
 * Stores the org symmetric key encrypted with the user's public key.
 */
export async function confirmOrgUser(
  db: D1Database,
  orgUserId: string,
  key: string,
  updatedAt: string
): Promise<void> {
  await db
    .prepare(
      'UPDATE organization_users SET key = ?, status = 2, updated_at = ? WHERE id = ?'
    )
    .bind(key, updatedAt, orgUserId)
    .run();
}

export async function deleteOrganizationByIdForOwner(
  db: D1Database,
  organizationId: string,
  ownerUserId: string
): Promise<boolean> {
  const result = await db
    .prepare(
      'DELETE FROM organizations WHERE id = ? AND EXISTS (' +
        'SELECT 1 FROM organization_users ou ' +
        'WHERE ou.organization_id = organizations.id AND ou.user_id = ? AND ou.role = 0 AND ou.status = 2' +
      ')'
    )
    .bind(organizationId, ownerUserId)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}
