import type {
  ListResponse,
  Organization,
  OrganizationCollection,
  OrganizationMemberRole,
  OrganizationUserDetails,
} from '../types';
import { createApiError, parseErrorMessage, parseJson, type AuthedFetch } from './shared';

async function throwApiError(resp: Response, fallback: string): Promise<never> {
  throw createApiError(await parseErrorMessage(resp, fallback), resp.status);
}

export async function listOrganizations(authedFetch: AuthedFetch): Promise<Organization[]> {
  const resp = await authedFetch('/api/organizations');
  if (!resp.ok) await throwApiError(resp, 'Failed to load organizations');
  const body = await parseJson<ListResponse<Organization>>(resp);
  return body?.data || [];
}

export async function createOrganization(
  authedFetch: AuthedFetch,
  payload: {
    name: string;
    billingEmail?: string;
    key: string;
    publicKey?: string;
    encryptedPrivateKey?: string;
  }
): Promise<Organization> {
  const resp = await authedFetch('/api/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: payload.name,
      billingEmail: payload.billingEmail || null,
      key: payload.key,
      keys: {
        publicKey: payload.publicKey || null,
        encryptedPrivateKey: payload.encryptedPrivateKey || null,
      },
    }),
  });
  if (!resp.ok) await throwApiError(resp, 'Failed to create organization');
  return (await parseJson<Organization>(resp)) as Organization;
}

export async function listOrganizationUsers(
  authedFetch: AuthedFetch,
  organizationId: string
): Promise<OrganizationUserDetails[]> {
  const resp = await authedFetch(`/api/organizations/${encodeURIComponent(organizationId)}/users`);
  if (!resp.ok) await throwApiError(resp, 'Failed to load organization users');
  const body = await parseJson<ListResponse<OrganizationUserDetails>>(resp);
  return body?.data || [];
}

export async function inviteOrganizationUsers(
  authedFetch: AuthedFetch,
  organizationId: string,
  payload: {
    emails: string[];
    type?: OrganizationMemberRole;
    accessAll?: boolean;
  }
): Promise<void> {
  const resp = await authedFetch(`/api/organizations/${encodeURIComponent(organizationId)}/users/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) await throwApiError(resp, 'Failed to invite users');
}

export async function acceptOrganizationInvite(
  authedFetch: AuthedFetch,
  organizationId: string,
  orgUserId: string
): Promise<void> {
  const resp = await authedFetch(
    `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(orgUserId)}/accept`,
    { method: 'POST' }
  );
  if (!resp.ok) await throwApiError(resp, 'Failed to accept invite');
}

export async function confirmOrganizationUser(
  authedFetch: AuthedFetch,
  organizationId: string,
  orgUserId: string,
  key: string
): Promise<void> {
  const resp = await authedFetch(
    `/api/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(orgUserId)}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }
  );
  if (!resp.ok) await throwApiError(resp, 'Failed to confirm user');
}

export async function listOrganizationCollections(
  authedFetch: AuthedFetch,
  organizationId: string
): Promise<OrganizationCollection[]> {
  const resp = await authedFetch(`/api/organizations/${encodeURIComponent(organizationId)}/collections`);
  if (!resp.ok) await throwApiError(resp, 'Failed to load collections');
  const body = await parseJson<ListResponse<OrganizationCollection>>(resp);
  return body?.data || [];
}

export async function createOrganizationCollection(
  authedFetch: AuthedFetch,
  organizationId: string,
  name: string
): Promise<OrganizationCollection> {
  const resp = await authedFetch(`/api/organizations/${encodeURIComponent(organizationId)}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!resp.ok) await throwApiError(resp, 'Failed to create collection');
  return (await parseJson<OrganizationCollection>(resp)) as OrganizationCollection;
}

export async function updateOrganizationCollection(
  authedFetch: AuthedFetch,
  organizationId: string,
  collectionId: string,
  payload: {
    name: string;
    externalId?: string | null;
  }
): Promise<OrganizationCollection> {
  const resp = await authedFetch(
    `/api/organizations/${encodeURIComponent(organizationId)}/collections/${encodeURIComponent(collectionId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (!resp.ok) await throwApiError(resp, 'Failed to update collection');
  return (await parseJson<OrganizationCollection>(resp)) as OrganizationCollection;
}

export async function deleteOrganizationCollection(
  authedFetch: AuthedFetch,
  organizationId: string,
  collectionId: string
): Promise<void> {
  const resp = await authedFetch(
    `/api/organizations/${encodeURIComponent(organizationId)}/collections/${encodeURIComponent(collectionId)}`,
    { method: 'DELETE' }
  );
  if (!resp.ok) await throwApiError(resp, 'Failed to delete collection');
}

export async function updateOrganizationCollectionUsers(
  authedFetch: AuthedFetch,
  organizationId: string,
  collectionId: string,
  userIds: string[]
): Promise<void> {
  const grants = userIds.map((orgUserId) => ({ orgUserId, readOnly: false, hidePasswords: false }));
  const resp = await authedFetch(
    `/api/organizations/${encodeURIComponent(organizationId)}/collections/${encodeURIComponent(collectionId)}/users`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(grants),
    }
  );
  if (!resp.ok) await throwApiError(resp, 'Failed to update collection users');
}
