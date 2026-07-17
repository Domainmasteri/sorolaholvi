import { useEffect, useMemo, useState } from 'preact/hooks';
import { Plus, RefreshCw, Trash2 } from 'lucide-preact';
import type { AuthedFetch } from '@/lib/api/shared';
import {
  acceptOrganizationInvite,
  confirmOrganizationUser,
  createOrganization,
  createOrganizationCollection,
  deleteOrganizationCollection,
  inviteOrganizationUsers,
  listOrganizationCollections,
  listOrganizations,
  listOrganizationUsers,
  updateOrganizationCollection,
  updateOrganizationCollectionUsers,
} from '@/lib/api/organizations';
import { t } from '@/lib/i18n';
import type { Organization, OrganizationCollection, OrganizationMemberRole, OrganizationUserDetails } from '@/lib/types';

interface OrganizationsPageProps {
  authedFetch: AuthedFetch;
  profileEmail: string;
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

function roleLabel(role: number): string {
  if (role === 0) return 'Owner';
  if (role === 1) return 'Admin';
  if (role === 2) return t('txt_role_user');
  if (role === 3) return 'Manager';
  return 'Custom';
}

function statusLabel(status: number): string {
  if (status === -1) return 'Revoked';
  if (status === 0) return 'Invited';
  if (status === 1) return 'Accepted';
  if (status === 2) return 'Confirmed';
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
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganizationMemberRole>(2);
  const [inviteAccessAll, setInviteAccessAll] = useState(false);
  const [confirmKeys, setConfirmKeys] = useState<Record<string, string>>({});
  const [newCollectionName, setNewCollectionName] = useState('');

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
              <option value="0">Owner</option>
              <option value="1">Admin</option>
              <option value="2">{t('txt_role_user')}</option>
              <option value="3">Manager</option>
              <option value="4">Custom</option>
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
              const canAccept = member.status === 0 && member.email.toLowerCase() === props.profileEmail.toLowerCase();
              const canConfirm = member.status === 1;
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
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || !selectedOrganizationId}
                      onClick={() => {
                        const nextName = window.prompt('Collection name', collection.name);
                        if (!nextName || !selectedOrganizationId) return;
                        void withBusy(async () => {
                          await updateOrganizationCollection(props.authedFetch, selectedOrganizationId, collection.id, {
                            name: nextName.trim(),
                            externalId: collection.externalId || null,
                          });
                          await loadSelectedOrganizationDetails(selectedOrganizationId);
                          props.onNotify('success', 'Collection updated');
                        });
                      }}
                    >
                      {t('txt_edit')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || !selectedOrganizationId}
                      onClick={() => {
                        const value = window.prompt('Org user IDs (comma separated)', '');
                        if (value === null || !selectedOrganizationId) return;
                        const userIds = value.split(',').map((entry) => entry.trim()).filter(Boolean);
                        void withBusy(async () => {
                          await updateOrganizationCollectionUsers(props.authedFetch, selectedOrganizationId, collection.id, userIds);
                          props.onNotify('success', 'Collection access updated');
                        });
                      }}
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
