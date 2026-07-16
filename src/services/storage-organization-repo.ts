import type { Organization, OrganizationUser } from '../types';

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
