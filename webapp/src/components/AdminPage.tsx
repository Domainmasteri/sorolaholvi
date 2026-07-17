import { useEffect, useState } from 'preact/hooks';
import { ChevronLeft, ChevronRight, Clipboard, Plus, RefreshCw, Trash2, UserCheck, UserX } from 'lucide-preact';
import { copyTextToClipboard } from '@/lib/clipboard';
import LoadingState from '@/components/LoadingState';
import type { AdminInvite, AdminSystemSettings, AdminUser } from '@/lib/types';
import { t } from '@/lib/i18n';

interface AdminPageProps {
  currentUserId: string;
  currentUserRole: string;
  users: AdminUser[];
  invites: AdminInvite[];
  settings: AdminSystemSettings | null;
  loading: boolean;
  settingsLoading: boolean;
  error: string;
  onRefresh: () => void;
  onCreateInvite: (hours: number) => Promise<void>;
  onDeleteInvalidInvites: () => Promise<void>;
  onDeleteAllInvites: () => Promise<void>;
  onToggleUserStatus: (userId: string, currentStatus: 'active' | 'banned') => Promise<void>;
  onSetUserRole: (userId: string, role: 'owner' | 'admin' | 'user') => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onDeleteInvite: (code: string) => Promise<void>;
  onSaveSettings: (settings: Partial<AdminSystemSettings>) => Promise<void>;
}

export default function AdminPage(props: AdminPageProps) {
  const [inviteHours, setInviteHours] = useState(168);
  const [page, setPage] = useState(1);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [emailChangeEnabled, setEmailChangeEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailFromEmail, setEmailFromEmail] = useState('');
  const [emailFromName, setEmailFromName] = useState('');
  const [emailSmtpHost, setEmailSmtpHost] = useState('');
  const [emailSmtpPort, setEmailSmtpPort] = useState('');
  const [emailSmtpUsername, setEmailSmtpUsername] = useState('');
  const [emailSmtpPassword, setEmailSmtpPassword] = useState('');
  const pageSize = 20;
  const formatExpiresAt = (x?: string) => (x ? new Date(x).toLocaleString() : t('txt_dash'));
  const totalPages = Math.max(1, Math.ceil(props.invites.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedInvites = props.invites.slice((safePage - 1) * pageSize, safePage * pageSize);

  const roleText = (role: string) => {
    const normalized = String(role || '').toLowerCase();
    if (normalized === 'owner') return t('txt_role_owner');
    if (normalized === 'admin') return t('txt_role_admin');
    if (normalized === 'user') return t('txt_role_user');
    return role || '-';
  };

  const normalizeUserRole = (role: string): 'owner' | 'admin' | 'user' | null => {
    const normalized = String(role || '').toLowerCase();
    if (normalized === 'owner' || normalized === 'admin' || normalized === 'user') return normalized;
    return null;
  };

  const canManageUserRole = (actor: 'owner' | 'admin' | 'user' | null, userId: string, currentUserId: string, targetRole: 'owner' | 'admin' | 'user' | null): boolean => {
    if (actor === 'owner') return userId !== currentUserId;
    if (actor === 'admin') return userId !== currentUserId && targetRole !== 'owner';
    return false;
  };

  const actorRole = normalizeUserRole(props.currentUserRole);

  const statusText = (status: string) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'active') return t('txt_status_active');
    if (normalized === 'banned') return t('txt_status_banned');
    if (normalized === 'inactive') return t('txt_status_inactive');
    return status || '-';
  };

  const normalizeToggleableStatus = (status: string): 'active' | 'banned' | null => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'active' || normalized === 'banned') return normalized;
    return null;
  };

  useEffect(() => {
    if (!props.settings) return;
    setRegistrationEnabled(props.settings.registrationEnabled !== false);
    setEmailChangeEnabled(props.settings.emailChangeEnabled !== false);
    setEmailEnabled(props.settings.email?.enabled === true);
    setEmailFromEmail(props.settings.email?.fromEmail || '');
    setEmailFromName(props.settings.email?.fromName || '');
    setEmailSmtpHost(props.settings.email?.smtpHost || '');
    setEmailSmtpPort(props.settings.email?.smtpPort != null ? String(props.settings.email.smtpPort) : '');
    setEmailSmtpUsername(props.settings.email?.smtpUsername || '');
    setEmailSmtpPassword(props.settings.email?.smtpPassword || '');
  }, [props.settings]);

  return (
    <div className="stack">
      {!!props.error && (
        <div className="local-error">
          <span>{props.error}</span>
          <button type="button" className="btn btn-secondary small" onClick={props.onRefresh}>
            <RefreshCw size={14} className="btn-icon" />
            {t('txt_refresh')}
          </button>
        </div>
      )}
      <section className="card">
        <div className="section-head">
          <h3>{t('txt_settings')}</h3>
          <button type="button" className="btn btn-secondary small" disabled={props.loading || props.settingsLoading} onClick={props.onRefresh}>
            <RefreshCw size={14} className="btn-icon" /> {t('txt_refresh')}
          </button>
        </div>
        <div className="stack">
          <label className="field">
            <span>{t('txt_registration_enabled')}</span>
            <input
              type="checkbox"
              checked={registrationEnabled}
              onChange={(e) => setRegistrationEnabled((e.currentTarget as HTMLInputElement).checked)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <label className="field">
            <span>{t('txt_allow_user_email_changes')}</span>
            <input
              type="checkbox"
              checked={emailChangeEnabled}
              onChange={(e) => setEmailChangeEnabled((e.currentTarget as HTMLInputElement).checked)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={props.loading || props.settingsLoading}
              onClick={() => void props.onSaveSettings({
                registrationEnabled,
                emailChangeEnabled,
              })}
            >
              {t('txt_save')}
            </button>
          </div>
        </div>
      </section>
      <section className="card">
        <div className="section-head">
          <h3>{t('txt_email_settings')}</h3>
        </div>
        <div className="stack">
          <label className="field">
            <span>{t('txt_email_delivery_enabled')}</span>
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled((e.currentTarget as HTMLInputElement).checked)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <label className="field">
            <span>{t('txt_from_email')}</span>
            <input
              className="input"
              type="email"
              value={emailFromEmail}
              onInput={(e) => setEmailFromEmail((e.currentTarget as HTMLInputElement).value)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <label className="field">
            <span>{t('txt_from_name')}</span>
            <input
              className="input"
              type="text"
              value={emailFromName}
              onInput={(e) => setEmailFromName((e.currentTarget as HTMLInputElement).value)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <label className="field">
            <span>{t('txt_smtp_host')}</span>
            <input
              className="input"
              type="text"
              value={emailSmtpHost}
              onInput={(e) => setEmailSmtpHost((e.currentTarget as HTMLInputElement).value)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <label className="field">
            <span>{t('txt_smtp_port')}</span>
            <input
              className="input"
              type="number"
              value={emailSmtpPort}
              min={1}
              max={65535}
              onInput={(e) => setEmailSmtpPort((e.currentTarget as HTMLInputElement).value)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <label className="field">
            <span>{t('txt_smtp_username')}</span>
            <input
              className="input"
              type="text"
              value={emailSmtpUsername}
              onInput={(e) => setEmailSmtpUsername((e.currentTarget as HTMLInputElement).value)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <label className="field">
            <span>{t('txt_smtp_password')}</span>
            <input
              className="input"
              type="password"
              value={emailSmtpPassword}
              onInput={(e) => setEmailSmtpPassword((e.currentTarget as HTMLInputElement).value)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={props.loading || props.settingsLoading}
              onClick={() => void props.onSaveSettings({
                email: {
                  enabled: emailEnabled,
                  fromEmail: emailFromEmail,
                  fromName: emailFromName,
                  smtpHost: emailSmtpHost,
                  smtpPort: emailSmtpPort ? (Number(emailSmtpPort) || null) : null,
                  smtpUsername: emailSmtpUsername,
                  smtpPassword: emailSmtpPassword,
                },
              })}
            >
              {t('txt_save')}
            </button>
          </div>
        </div>
      </section>
      <section className="card">
        <div className="section-head">
          <h3>{t('txt_users')}</h3>
          <button type="button" className="btn btn-secondary small" disabled={props.loading} onClick={props.onRefresh}>
            <RefreshCw size={14} className="btn-icon" /> {t('txt_refresh')}
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>{t('txt_email')}</th>
              <th>{t('txt_name')}</th>
              <th>{t('txt_role')}</th>
              <th>{t('txt_status')}</th>
              <th>{t('txt_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {props.users.map((user) => {
              const toggleableStatus = normalizeToggleableStatus(user.status);
              const userRole = normalizeUserRole(user.role);
              const canManageRole = canManageUserRole(actorRole, user.id, props.currentUserId, userRole);
              const canDeleteUser = user.id !== props.currentUserId && userRole !== 'owner';
              return (
                <tr key={user.id}>
                <td data-label={t('txt_email')}>{user.email}</td>
                <td data-label={t('txt_name')}>{user.name || t('txt_dash')}</td>
                <td data-label={t('txt_role')}>{roleText(user.role)}</td>
                <td data-label={t('txt_status')}>{statusText(user.status)}</td>
                <td data-label={t('txt_actions')}>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={user.id === props.currentUserId || !toggleableStatus || (actorRole !== 'owner' && userRole === 'owner')}
                      onClick={() => {
                        if (!toggleableStatus) return;
                        void props.onToggleUserStatus(user.id, toggleableStatus);
                      }}
                    >
                      {user.status === 'active' ? <UserX size={14} className="btn-icon" /> : <UserCheck size={14} className="btn-icon" />}
                      {user.status === 'active' ? t('txt_ban') : t('txt_unban')}
                    </button>
                    {canManageRole && userRole && (
                      <select
                        className="input"
                        value={userRole}
                        onChange={(e) => {
                          const nextRole = normalizeUserRole((e.currentTarget as HTMLSelectElement).value);
                          if (!nextRole || nextRole === userRole) return;
                          void props.onSetUserRole(user.id, nextRole);
                        }}
                      >
                        {actorRole === 'owner' && <option value="owner">{t('txt_role_owner')}</option>}
                        <option value="admin">{t('txt_role_admin')}</option>
                        <option value="user">{t('txt_role_user')}</option>
                      </select>
                    )}
                    {canDeleteUser && (
                      <button type="button" className="btn btn-danger" onClick={() => void props.onDeleteUser(user.id)}>
                        <Trash2 size={14} className="btn-icon" />
                        {t('txt_delete')}
                      </button>
                    )}
                  </div>
                </td>
                </tr>
              );
            })}
            {props.loading && !props.users.length && (
              <tr>
                <td colSpan={5}>
                  <LoadingState lines={4} compact />
                </td>
              </tr>
            )}
            {!props.loading && !props.users.length && (
              <tr>
                <td colSpan={5}>
                  <div className="empty empty-comfortable">{t('txt_no_users_found')}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card admin-invites-card">
        <div className="section-head admin-invites-head">
          <h3>{t('txt_invites')}</h3>
          <div className="actions admin-invites-head-actions">
            <button type="button" className="btn btn-secondary small" disabled={props.loading} onClick={props.onRefresh}>
              <RefreshCw size={14} className="btn-icon" /> {t('txt_refresh')}
            </button>
            <button type="button" className="btn btn-danger small" onClick={() => void props.onDeleteInvalidInvites()}>
              <Trash2 size={14} className="btn-icon" /> {t('txt_delete_invalid')}
            </button>
            <button type="button" className="btn btn-danger small" onClick={() => void props.onDeleteAllInvites()}>
              <Trash2 size={14} className="btn-icon" /> {t('txt_delete_all')}
            </button>
          </div>
        </div>
        <div className="invite-toolbar">
          <div className="invite-create-group">
            <label className="field invite-hours-field">
              <span>{t('txt_invite_validity_hours')}</span>
              <input
                className="input small"
                type="number"
                value={inviteHours}
                min={1}
                max={720}
                onInput={(e) => setInviteHours(Number((e.currentTarget as HTMLInputElement).value || 168))}
              />
            </label>
            <button type="button" className="btn btn-primary" onClick={() => void props.onCreateInvite(inviteHours)}>
              <Plus size={14} className="btn-icon" />
              {t('txt_create_timed_invite')}
            </button>
          </div>
        </div>
        <table className="table invite-table">
          <thead>
            <tr>
              <th>{t('txt_code')}</th>
              <th>{t('txt_status')}</th>
              <th>{t('txt_expires_at')}</th>
              <th className="invite-actions-head">{t('txt_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pagedInvites.map((invite) => (
              <tr key={invite.code}>
                <td data-label={t('txt_code')}>{invite.code}</td>
                <td data-label={t('txt_status')}>{statusText(invite.status)}</td>
                <td data-label={t('txt_expires_at')}>{formatExpiresAt(invite.expiresAt)}</td>
                <td data-label={t('txt_actions')}>
                  <div className="actions invite-row-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void copyTextToClipboard(invite.inviteLink || '', { successMessage: t('txt_link_copied') })}
                    >
                      <Clipboard size={14} className="btn-icon" /> {t('txt_copy_link')}
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => void props.onDeleteInvite(invite.code)}>
                      <Trash2 size={14} className="btn-icon" /> {t('txt_delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {props.loading && !props.invites.length && (
              <tr>
                <td colSpan={4}>
                  <LoadingState lines={4} compact />
                </td>
              </tr>
            )}
            {!props.loading && !props.invites.length && (
              <tr>
                <td colSpan={4}>
                  <div className="empty empty-comfortable">{t('txt_no_invites_found')}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="actions admin-pagination invite-pagination">
          <button type="button" className="btn btn-secondary small" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft size={14} className="btn-icon" />
            {t('txt_prev')}
          </button>
          <span className="muted-inline">{safePage} / {totalPages}</span>
          <button type="button" className="btn btn-secondary small" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            {t('txt_next')}
            <ChevronRight size={14} className="btn-icon" />
          </button>
        </div>
      </section>
    </div>
  );
}
