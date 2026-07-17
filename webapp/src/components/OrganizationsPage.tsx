import { useEffect, useMemo, useState } from 'preact/hooks';
import { Plus, RefreshCw, Trash2 } from 'lucide-preact';
import type { AuthedFetch } from '@/lib/api/shared';
import {
  acceptOrganizationInvite,
  confirmOrganizationUser,
  createOrganization,
  createOrganizationCollection,
  deleteOrganization,
  deleteOrganizationCollection,
  inviteOrganizationUsers,
  listOrganizationCollections,
  listOrganizations,
  listOrganizationUsers,
  updateOrganizationCollection,
  updateOrganizationCollectionUsers,
} from '@/lib/api/organizations';
import { t } from '@/lib/i18n';
import {
  ORGANIZATION_MEMBER_ROLE,
  ORGANIZATION_MEMBER_STATUS,
  type Organization,
  type OrganizationCollection,
  type OrganizationMemberRole,
  type OrganizationUserDetails,
} from '@/lib/types';

interface OrganizationsPageProps {
  authedFetch: AuthedFetch;
  profileEmail: string;
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

function roleLabel(role: number): string {
  if (role === ORGANIZATION_MEMBER_ROLE.OWNER) return 'Owner';
  if (role === ORGANIZATION_MEMBER_ROLE.ADMIN) return 'Admin';
  if (role === ORGANIZATION_MEMBER_ROLE.USER) return t('txt_role_user');
  if (role === ORGANIZATION_MEMBER_ROLE.MANAGER) return 'Manager';
  return 'Custom';
}

function statusLabel(status: number): string {
  if (status === ORGANIZATION_MEMBER_STATUS.REVOKED) return 'Revoked';
  if (status === ORGANIZATION_MEMBER_STATUS.INVITED) return 'Invited';
  if (status === ORGANIZATION_MEMBER_STATUS.ACCEPTED) return 'Accepted';
  if (status === ORGANIZATION_MEMBER_STATUS.CONFIRMED) return 'Confirmed';
  return String(status);
}

export default function OrganizationsPage(props: OrganizationsPageProps) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [members, setMembers] = useState<OrganizationUserDetails[]>([]);
  const [collections, setCollections] = useState<OrganizationCollection[]>([]);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createKey, setCreateKey] = useState('');
  const [confirmDeleteOrganizationId, setConfirmDeleteOrganizationId] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganizationMemberRole>(ORGANIZATION_MEMBER_ROLE.USER);
  const [inviteAccessAll, setInviteAccessAll] = useState(false);
  const [confirmKeys, setConfirmKeys] = useState<Record<string, string>>({});
  const [newCollectionName, setNewCollectionName] = useState('');
  const [collectionNames, setCollectionNames] = useState<Record<string, string>>({});
  const [collectionUserIds, setCollectionUserIds] = useState<Record<string, string>>({});
  const normalizedProfileEmail = props.profileEmail.trim().toLowerCase();

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org.id === selectedOrganizationId) || null,
    [organizations, selectedOrganizationId]
  );

  async function loadOrganizations(preferredOrganizationId?: string): Promise<void> {
    const orgs = await listOrganizations(props.authedFetch);
    setOrganizations(orgs);
    setSelectedOrganizationId((current) => {
      const preferred = preferredOrganizationId || current;
      if (preferred && orgs.some((org) => org.id === preferred)) return preferred;
      return orgs[0]?.id || '';
    });
  }

  async function refreshAll(preferredOrganizationId?: string): Promise<void> {
    setError('');
    try {
      await loadOrganizations(preferredOrganizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
      throw err;
    }
  }

  async function loadSelectedOrganizationDetails(organizationId: string): Promise<void> {
    if (!organizationId) {
      setMembers([]);
      setCollections([]);
      return;
    }
    const [nextMembers, nextCollections] = await Promise.all([
      listOrganizationUsers(props.authedFetch, organizationId),
      listOrganizationCollections(props.authedFetch, organizationId),
    ]);
    setMembers(nextMembers);
    setCollections(nextCollections);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refreshAll();
      } catch {
        // handled in refreshAll
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedOrganizationId) {
        setMembers([]);
        setCollections([]);
        return;
      }
      try {
        await loadSelectedOrganizationDetails(selectedOrganizationId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load organization details');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedOrganizationId]);

  useEffect(() => {
    setCollectionNames((current) => {
      const next = { ...current };
      for (const collection of collections) {
        if (next[collection.id] === undefined) next[collection.id] = collection.name || '';
      }
      return next;
    });
  }, [collections]);

  useEffect(() => {
    if (confirmDeleteOrganizationId && confirmDeleteOrganizationId !== selectedOrganizationId) {
      setConfirmDeleteOrganizationId('');
    }
  }, [confirmDeleteOrganizationId, selectedOrganizationId]);

  async function withBusy(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('txt_unexpected_error');
      setError(message);
      props.onNotify('error', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {!!error && (
        <div className="local-error">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary small"
            disabled={busy || loading}
            onClick={() => void withBusy(() => refreshAll(selectedOrganizationId))}
          >
            <RefreshCw size={14} className="btn-icon" />
            {t('txt_refresh')}
          </button>
        </div>
      )}

      <section className="card">
        <div className="section-head">
          <h3>Organizations</h3>
          <button
            type="button"
            className="btn btn-secondary small"
            disabled={busy || loading}
            onClick={() => void withBusy(() => refreshAll(selectedOrganizationId))}
          >
            <RefreshCw size={14} className="btn-icon" />
            {t('txt_refresh')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="field">
            <span>Organization</span>
            <select
              className="input"
              value={selectedOrganizationId}
              disabled={busy || loading || organizations.length === 0}
              onChange={(event) => setSelectedOrganizationId((event.currentTarget as HTMLSelectElement).value)}
            >
              {organizations.length === 0 ? (
                <option value="">None</option>
              ) : (
                organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name || org.id}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="field">
            <span>Selected organization ID</span>
            <input className="input" value={selectedOrganization?.id || ''} readOnly />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="field">
            <span>{t('txt_name')}</span>
            <input className="input" value={createName} onInput={(event) => setCreateName((event.currentTarget as HTMLInputElement).value)} />
          </label>
          <label className="field">
            <span>{t('txt_email')}</span>
            <input className="input" value={createEmail} onInput={(event) => setCreateEmail((event.currentTarget as HTMLInputElement).value)} />
          </label>
          <label className="field">
            <span>Key</span>
            <input className="input" value={createKey} onInput={(event) => setCreateKey((event.currentTarget as HTMLInputElement).value)} />
          </label>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !createName.trim() || !createKey.trim()}
            onClick={() => void withBusy(async () => {
              const created = await createOrganization(props.authedFetch, {
                name: createName.trim(),
                billingEmail: createEmail.trim(),
                key: createKey.trim(),
              });
              setCreateName('');
              setCreateEmail('');
              setCreateKey('');
              await refreshAll(created.id);
              await loadSelectedOrganizationDetails(created.id);
              props.onNotify('success', 'Organization created');
            })}
          >
            <Plus size={14} className="btn-icon" />
            {t('txt_create')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy || !selectedOrganizationId}
            onClick={() => void withBusy(async () => {
              if (!selectedOrganizationId) return;
              if (confirmDeleteOrganizationId !== selectedOrganizationId) {
                setConfirmDeleteOrganizationId(selectedOrganizationId);
                return;
              }
              await deleteOrganization(props.authedFetch, selectedOrganizationId);
              setConfirmDeleteOrganizationId('');
              await refreshAll();
              props.onNotify('success', 'Organization deleted');
            })}
          >
            <Trash2 size={14} className="btn-icon" />
            {confirmDeleteOrganizationId === selectedOrganizationId ? t('txt_confirm') : t('txt_delete')}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h3>{t('txt_users')}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="field md:col-span-2">
            <span>{t('txt_email')}</span>
            <input
              className="input"
              placeholder="a@example.com,b@example.com"
              value={inviteEmails}
              disabled={busy || !selectedOrganizationId}
              onInput={(event) => setInviteEmails((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label className="field">
            <span>{t('txt_role')}</span>
            <select
              className="input"
              value={String(inviteRole)}
              disabled={busy || !selectedOrganizationId}
              onChange={(event) => setInviteRole(Number((event.currentTarget as HTMLSelectElement).value) as OrganizationMemberRole)}
            >
              <option value={String(ORGANIZATION_MEMBER_ROLE.OWNER)}>Owner</option>
              <option value={String(ORGANIZATION_MEMBER_ROLE.ADMIN)}>Admin</option>
              <option value={String(ORGANIZATION_MEMBER_ROLE.USER)}>{t('txt_role_user')}</option>
              <option value={String(ORGANIZATION_MEMBER_ROLE.MANAGER)}>Manager</option>
              <option value={String(ORGANIZATION_MEMBER_ROLE.CUSTOM)}>Custom</option>
            </select>
          </label>
          <label className="field">
            <span>Access all</span>
            <input
              type="checkbox"
              checked={inviteAccessAll}
              disabled={busy || !selectedOrganizationId}
              onChange={(event) => setInviteAccessAll((event.currentTarget as HTMLInputElement).checked)}
            />
          </label>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !selectedOrganizationId || !inviteEmails.trim()}
            onClick={() => void withBusy(async () => {
              const emails = inviteEmails
                .split(/[,\n;]/)
                .map((entry) => entry.trim())
                .filter(Boolean);
              if (!emails.length || !selectedOrganizationId) return;
              await inviteOrganizationUsers(props.authedFetch, selectedOrganizationId, {
                emails,
                type: inviteRole,
                accessAll: inviteAccessAll,
              });
              setInviteEmails('');
              await loadSelectedOrganizationDetails(selectedOrganizationId);
              props.onNotify('success', 'Invites sent');
            })}
          >
            <Plus size={14} className="btn-icon" />
            Invite
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>{t('txt_email')}</th>
              <th>{t('txt_role')}</th>
              <th>{t('txt_status')}</th>
              <th>{t('txt_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const canAccept = member.status === ORGANIZATION_MEMBER_STATUS.INVITED && member.email.toLowerCase() === normalizedProfileEmail;
              const canConfirm = member.status === ORGANIZATION_MEMBER_STATUS.ACCEPTED;
              const confirmKey = confirmKeys[member.id] || '';
              return (
                <tr key={member.id}>
                  <td data-label={t('txt_email')}>{member.email}</td>
                  <td data-label={t('txt_role')}>{roleLabel(member.type)}</td>
                  <td data-label={t('txt_status')}>{statusLabel(member.status)}</td>
                  <td data-label={t('txt_actions')}>
                    <div className="actions">
                      {canAccept && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy || !selectedOrganizationId}
                          onClick={() => void withBusy(async () => {
                            if (!selectedOrganizationId) return;
                            await acceptOrganizationInvite(props.authedFetch, selectedOrganizationId, member.id);
                            await loadSelectedOrganizationDetails(selectedOrganizationId);
                            props.onNotify('success', 'Invite accepted');
                          })}
                        >
                          Accept
                        </button>
                      )}
                      {canConfirm && (
                        <>
                          <input
                            className="input small"
                            placeholder="Key"
                            value={confirmKey}
                            onInput={(event) =>
                              setConfirmKeys((current) => ({
                                ...current,
                                [member.id]: (event.currentTarget as HTMLInputElement).value,
                              }))}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy || !selectedOrganizationId || !confirmKey.trim()}
                            onClick={() => void withBusy(async () => {
                              if (!selectedOrganizationId) return;
                              await confirmOrganizationUser(props.authedFetch, selectedOrganizationId, member.id, confirmKey.trim());
                              setConfirmKeys((current) => ({ ...current, [member.id]: '' }));
                              await loadSelectedOrganizationDetails(selectedOrganizationId);
                              props.onNotify('success', 'User confirmed');
                            })}
                          >
                            {t('txt_confirm')}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && members.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty empty-comfortable">{t('txt_no_users_found')}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="section-head">
          <h3>Collections</h3>
        </div>
        <div className="actions">
          <input
            className="input"
            placeholder={t('txt_name')}
            value={newCollectionName}
            disabled={busy || !selectedOrganizationId}
            onInput={(event) => setNewCollectionName((event.currentTarget as HTMLInputElement).value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !selectedOrganizationId || !newCollectionName.trim()}
            onClick={() => void withBusy(async () => {
              if (!selectedOrganizationId) return;
              await createOrganizationCollection(props.authedFetch, selectedOrganizationId, newCollectionName.trim());
              setNewCollectionName('');
              await loadSelectedOrganizationDetails(selectedOrganizationId);
              props.onNotify('success', 'Collection created');
            })}
          >
            <Plus size={14} className="btn-icon" />
            {t('txt_create')}
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>{t('txt_name')}</th>
              <th>ID</th>
              <th>{t('txt_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {collections.map((collection) => (
              <tr key={collection.id}>
                <td data-label={t('txt_name')}>{collection.name}</td>
                <td data-label="ID">{collection.id}</td>
                <td data-label={t('txt_actions')}>
                  <div className="actions">
                    <input
                      className="input small"
                      placeholder={t('txt_name')}
                      value={collectionNames[collection.id] ?? collection.name}
                      onInput={(event) =>
                        setCollectionNames((current) => ({
                          ...current,
                          [collection.id]: (event.currentTarget as HTMLInputElement).value,
                        }))}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || !selectedOrganizationId || !(collectionNames[collection.id] || '').trim()}
                      onClick={() => void withBusy(async () => {
                        if (!selectedOrganizationId) return;
                        await updateOrganizationCollection(props.authedFetch, selectedOrganizationId, collection.id, {
                          name: String(collectionNames[collection.id] || collection.name).trim(),
                          externalId: collection.externalId || null,
                        });
                        await loadSelectedOrganizationDetails(selectedOrganizationId);
                        props.onNotify('success', 'Collection updated');
                      })}
                    >
                      {t('txt_edit')}
                    </button>
                    <input
                      className="input small"
                      placeholder="orgUserId1,orgUserId2"
                      value={collectionUserIds[collection.id] || ''}
                      onInput={(event) =>
                        setCollectionUserIds((current) => ({
                          ...current,
                          [collection.id]: (event.currentTarget as HTMLInputElement).value,
                        }))}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || !selectedOrganizationId}
                      onClick={() => void withBusy(async () => {
                        if (!selectedOrganizationId) return;
                        const userIds = String(collectionUserIds[collection.id] || '')
                          .split(',')
                          .map((entry) => entry.trim())
                          .filter(Boolean);
                        await updateOrganizationCollectionUsers(props.authedFetch, selectedOrganizationId, collection.id, userIds);
                        props.onNotify('success', 'Collection access updated');
                      })}
                    >
                      Access
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busy || !selectedOrganizationId}
                      onClick={() => void withBusy(async () => {
                        if (!selectedOrganizationId) return;
                        await deleteOrganizationCollection(props.authedFetch, selectedOrganizationId, collection.id);
                        await loadSelectedOrganizationDetails(selectedOrganizationId);
                        props.onNotify('success', 'Collection deleted');
                      })}
                    >
                      <Trash2 size={14} className="btn-icon" />
                      {t('txt_delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && collections.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <div className="empty empty-comfortable">None</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
