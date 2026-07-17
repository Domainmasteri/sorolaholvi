import { useEffect, useState } from 'preact/hooks';
import { ChevronLeft, ChevronRight, Clipboard, Plus, RefreshCw, Trash2, UserCheck, UserX } from 'lucide-preact';
import { copyTextToClipboard } from '@/lib/clipboard';
import LoadingState from '@/components/LoadingState';
import type { AdminInvite, AdminSystemSettings, AdminUser } from '@/lib/types';
import { t } from '@/lib/i18n';

interface AdminPageProps {
  currentUserId: string;
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
  onDeleteUser: (userId: string) => Promise<void>;
  onDeleteInvite: (code: string) => Promise<void>;
  onSaveSettings: (settings: Partial<AdminSystemSettings>) => Promise<void>;
}

export default function AdminPage(props: AdminPageProps) {
  const [inviteHours, setInviteHours] = useState(168);
  const [page, setPage] = useState(1);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const pageSize = 20;
  const formatExpiresAt = (x?: string) => (x ? new Date(x).toLocaleString() : t('txt_dash'));
  const totalPages = Math.max(1, Math.ceil(props.invites.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedInvites = props.invites.slice((safePage - 1) * pageSize, safePage * pageSize);

  const roleText = (role: string) => {
    const normalized = String(role || '').toLowerCase();
    if (normalized === 'admin') return t('txt_role_admin');
    if (normalized === 'user') return t('txt_role_user');
    return role || '-';
  };

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
    setEmailEnabled(!!props.settings.email?.enabled);
    setFromEmail(props.settings.email?.fromEmail || '');
    setFromName(props.settings.email?.fromName || '');
    setSmtpHost(props.settings.email?.smtpHost || '');
    setSmtpPort(props.settings.email?.smtpPort ? String(props.settings.email.smtpPort) : '');
    setSmtpUsername(props.settings.email?.smtpUsername || '');
    setSmtpPassword(props.settings.email?.smtpPassword || '');
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
            <span>Registration Enabled</span>
            <input
              type="checkbox"
              checked={registrationEnabled}
              onChange={(e) => setRegistrationEnabled((e.currentTarget as HTMLInputElement).checked)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <label className="field">
            <span>Email Delivery Enabled</span>
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled((e.currentTarget as HTMLInputElement).checked)}
              disabled={props.loading || props.settingsLoading}
            />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="field">
              <span>From Email</span>
              <input className="input" value={fromEmail} onInput={(e) => setFromEmail((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <label className="field">
              <span>From Name</span>
              <input className="input" value={fromName} onInput={(e) => setFromName((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <label className="field">
              <span>SMTP host</span>
              <input className="input" value={smtpHost} onInput={(e) => setSmtpHost((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <label className="field">
              <span>SMTP port</span>
              <input className="input" type="number" value={smtpPort} onInput={(e) => setSmtpPort((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <label className="field">
              <span>SMTP username</span>
              <input className="input" value={smtpUsername} onInput={(e) => setSmtpUsername((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <label className="field">
              <span>SMTP password</span>
              <input className="input" type="password" value={smtpPassword} onInput={(e) => setSmtpPassword((e.currentTarget as HTMLInputElement).value)} />
            </label>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={props.loading || props.settingsLoading}
              onClick={() => void props.onSaveSettings({
                registrationEnabled,
                email: {
                  enabled: emailEnabled,
                  fromEmail,
                  fromName,
                  smtpHost,
                  smtpPort: smtpPort.trim() ? Number(smtpPort) : null,
                  smtpUsername,
                  smtpPassword,
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
                      disabled={user.id === props.currentUserId || !toggleableStatus}
                      onClick={() => {
                        if (!toggleableStatus) return;
                        void props.onToggleUserStatus(user.id, toggleableStatus);
                      }}
                    >
                      {user.status === 'active' ? <UserX size={14} className="btn-icon" /> : <UserCheck size={14} className="btn-icon" />}
                      {user.status === 'active' ? t('txt_ban') : t('txt_unban')}
                    </button>
                    {user.role !== 'admin' && (
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
