import type { StorageService } from '../services/storage';

export const REGISTRATION_ENABLED_CONFIG_KEY = 'globalSettings__registration__enabled';
export const REQUIRE_EMAIL_CONFIRMATION_CONFIG_KEY = 'globalSettings__registration__requireEmailConfirmation';
export const EMAIL_TWO_FACTOR_ENABLED_CONFIG_KEY = 'globalSettings__account__emailTwoFactorEnabled';
export const EMAIL_ENABLED_CONFIG_KEY = 'globalSettings__email__enabled';
export const EMAIL_FROM_EMAIL_CONFIG_KEY = 'globalSettings__email__fromEmail';
export const EMAIL_FROM_NAME_CONFIG_KEY = 'globalSettings__email__fromName';
export const EMAIL_SMTP_HOST_CONFIG_KEY = 'globalSettings__email__smtpHost';
export const EMAIL_SMTP_PORT_CONFIG_KEY = 'globalSettings__email__smtpPort';
export const EMAIL_SMTP_USERNAME_CONFIG_KEY = 'globalSettings__email__smtpUsername';
export const EMAIL_SMTP_PASSWORD_CONFIG_KEY = 'globalSettings__email__smtpPassword';
export const EMAIL_CHANGE_ENABLED_CONFIG_KEY = 'globalSettings__account__allowEmailChange';

export interface EmailSettings {
  enabled: boolean;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number | null;
  smtpUsername: string;
  smtpPassword: string;
}

export interface SystemSettings {
  registrationEnabled: boolean;
  requireEmailConfirmation: boolean;
  emailTwoFactorEnabled: boolean;
  emailChangeEnabled: boolean;
  email: EmailSettings;
}

export interface SystemSettingsUpdate {
  registrationEnabled?: boolean;
  requireEmailConfirmation?: boolean;
  emailTwoFactorEnabled?: boolean;
  emailChangeEnabled?: boolean;
  email?: Partial<EmailSettings>;
}

function readBoolean(raw: string | null, fallback: boolean): boolean {
  if (raw === null) return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

function readString(raw: string | null): string {
  return String(raw || '').trim();
}

function readPort(raw: string | null): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  if (normalized < 1 || normalized > 65535) return null;
  return normalized;
}

export async function getSystemSettings(storage: StorageService): Promise<SystemSettings> {
  const registrationDefault = true;
  const registrationEnabled = readBoolean(await storage.getConfigValue(REGISTRATION_ENABLED_CONFIG_KEY), registrationDefault);
  const requireEmailConfirmation = readBoolean(await storage.getConfigValue(REQUIRE_EMAIL_CONFIRMATION_CONFIG_KEY), false);
  const emailTwoFactorEnabled = readBoolean(await storage.getConfigValue(EMAIL_TWO_FACTOR_ENABLED_CONFIG_KEY), false);
  const emailChangeEnabled = readBoolean(await storage.getConfigValue(EMAIL_CHANGE_ENABLED_CONFIG_KEY), true);
  const emailEnabled = readBoolean(await storage.getConfigValue(EMAIL_ENABLED_CONFIG_KEY), false);
  const email: EmailSettings = {
    enabled: emailEnabled,
    fromEmail: readString(await storage.getConfigValue(EMAIL_FROM_EMAIL_CONFIG_KEY)),
    fromName: readString(await storage.getConfigValue(EMAIL_FROM_NAME_CONFIG_KEY)),
    smtpHost: readString(await storage.getConfigValue(EMAIL_SMTP_HOST_CONFIG_KEY)),
    smtpPort: readPort(await storage.getConfigValue(EMAIL_SMTP_PORT_CONFIG_KEY)),
    smtpUsername: readString(await storage.getConfigValue(EMAIL_SMTP_USERNAME_CONFIG_KEY)),
    smtpPassword: readString(await storage.getConfigValue(EMAIL_SMTP_PASSWORD_CONFIG_KEY)),
  };
  return {
    registrationEnabled,
    requireEmailConfirmation,
    emailTwoFactorEnabled,
    emailChangeEnabled,
    email,
  };
}

export async function isRegistrationEnabled(storage: StorageService): Promise<boolean> {
  const userCount = await storage.getUserCount();
  if (userCount === 0) return true;
  return readBoolean(await storage.getConfigValue(REGISTRATION_ENABLED_CONFIG_KEY), true);
}

export async function isEmailDeliveryEnabled(storage: StorageService): Promise<boolean> {
  return readBoolean(await storage.getConfigValue(EMAIL_ENABLED_CONFIG_KEY), false);
}

export async function getEmailSettingsForDelivery(storage: StorageService): Promise<EmailSettings | null> {
  const enabled = readBoolean(await storage.getConfigValue(EMAIL_ENABLED_CONFIG_KEY), false);
  if (!enabled) return null;
  const host = readString(await storage.getConfigValue(EMAIL_SMTP_HOST_CONFIG_KEY));
  if (!host) return null;
  return {
    enabled: true,
    fromEmail: readString(await storage.getConfigValue(EMAIL_FROM_EMAIL_CONFIG_KEY)),
    fromName: readString(await storage.getConfigValue(EMAIL_FROM_NAME_CONFIG_KEY)),
    smtpHost: host,
    smtpPort: readPort(await storage.getConfigValue(EMAIL_SMTP_PORT_CONFIG_KEY)),
    smtpUsername: readString(await storage.getConfigValue(EMAIL_SMTP_USERNAME_CONFIG_KEY)),
    smtpPassword: readString(await storage.getConfigValue(EMAIL_SMTP_PASSWORD_CONFIG_KEY)),
  };
}

export async function saveSystemSettings(storage: StorageService, update: SystemSettingsUpdate): Promise<SystemSettings> {
  const current = await getSystemSettings(storage);
  const next: SystemSettings = {
    registrationEnabled: typeof update.registrationEnabled === 'boolean'
      ? update.registrationEnabled
      : current.registrationEnabled,
    requireEmailConfirmation: typeof update.requireEmailConfirmation === 'boolean'
      ? update.requireEmailConfirmation
      : current.requireEmailConfirmation,
    emailTwoFactorEnabled: typeof update.emailTwoFactorEnabled === 'boolean'
      ? update.emailTwoFactorEnabled
      : current.emailTwoFactorEnabled,
    emailChangeEnabled: typeof update.emailChangeEnabled === 'boolean'
      ? update.emailChangeEnabled
      : current.emailChangeEnabled,
    email: {
      enabled: typeof update.email?.enabled === 'boolean'
        ? update.email.enabled
        : current.email.enabled,
      fromEmail: typeof update.email?.fromEmail === 'string'
        ? update.email.fromEmail.trim()
        : current.email.fromEmail,
      fromName: typeof update.email?.fromName === 'string'
        ? update.email.fromName.trim()
        : current.email.fromName,
      smtpHost: typeof update.email?.smtpHost === 'string'
        ? update.email.smtpHost.trim()
        : current.email.smtpHost,
      smtpPort: update.email?.smtpPort === null
        ? null
        : typeof update.email?.smtpPort === 'number'
          ? readPort(String(update.email.smtpPort))
          : current.email.smtpPort,
      smtpUsername: typeof update.email?.smtpUsername === 'string'
        ? update.email.smtpUsername.trim()
        : current.email.smtpUsername,
      smtpPassword: typeof update.email?.smtpPassword === 'string'
        ? update.email.smtpPassword.trim()
        : current.email.smtpPassword,
    },
  };

  await storage.setConfigValue(REGISTRATION_ENABLED_CONFIG_KEY, next.registrationEnabled ? 'true' : 'false');
  await storage.setConfigValue(REQUIRE_EMAIL_CONFIRMATION_CONFIG_KEY, next.requireEmailConfirmation ? 'true' : 'false');
  await storage.setConfigValue(EMAIL_TWO_FACTOR_ENABLED_CONFIG_KEY, next.emailTwoFactorEnabled ? 'true' : 'false');
  await storage.setConfigValue(EMAIL_CHANGE_ENABLED_CONFIG_KEY, next.emailChangeEnabled ? 'true' : 'false');
  await storage.setConfigValue(EMAIL_ENABLED_CONFIG_KEY, next.email.enabled ? 'true' : 'false');
  await storage.setConfigValue(EMAIL_FROM_EMAIL_CONFIG_KEY, next.email.fromEmail);
  await storage.setConfigValue(EMAIL_FROM_NAME_CONFIG_KEY, next.email.fromName);
  await storage.setConfigValue(EMAIL_SMTP_HOST_CONFIG_KEY, next.email.smtpHost);
  await storage.setConfigValue(EMAIL_SMTP_PORT_CONFIG_KEY, next.email.smtpPort ? String(next.email.smtpPort) : '');
  await storage.setConfigValue(EMAIL_SMTP_USERNAME_CONFIG_KEY, next.email.smtpUsername);
  await storage.setConfigValue(EMAIL_SMTP_PASSWORD_CONFIG_KEY, next.email.smtpPassword);

  return next;
}
