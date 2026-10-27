export type LoginBackgroundType = "solid" | "gradient" | "image";
export type LoginProviderId = "github" | "google";

export interface LoginBrandSettings {
  name: string;
  subtitle: string;
  logo: string;
}

export interface LoginGradientSettings {
  from: string;
  to: string;
  angle: number;
}

export interface LoginOverlaySettings {
  color: string;
  opacity: number;
}

export interface LoginBackgroundSettings {
  type: LoginBackgroundType;
  color: string;
  gradient: LoginGradientSettings;
  image: string;
  overlay: LoginOverlaySettings;
}

export interface LoginProviderSettings {
  enabled: boolean;
  client_id: string;
}

export interface LoginSocialSettings {
  /** Match a verified provider email to an existing account. */
  link_by_email: boolean;
  github: LoginProviderSettings;
  google: LoginProviderSettings;
}

/** Shape persisted in data/settings/login.json. Secrets live elsewhere. */
export interface LoginSettingsFile {
  version: 1;
  brand: LoginBrandSettings;
  background: LoginBackgroundSettings;
  social: LoginSocialSettings;
  updated_at: number | null;
}

export interface LoginProviderRuntimeSettings extends LoginProviderSettings {
  client_secret: string;
}

export interface LoginRuntimeSettings {
  version: 1;
  brand: LoginBrandSettings;
  background: LoginBackgroundSettings;
  social: {
    link_by_email: boolean;
    github: LoginProviderRuntimeSettings;
    google: LoginProviderRuntimeSettings;
  };
  updated_at: number | null;
}

export interface LoginPublicProvider {
  id: LoginProviderId;
  label: string;
}

/** Safe to pass to the login view; never contains client secrets. */
export interface LoginPublicSettings {
  brand: LoginBrandSettings;
  background: LoginBackgroundSettings;
  providers: LoginPublicProvider[];
}
