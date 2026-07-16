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
