export type Branding = {
  logo_url?: string;
  primary_color?: string;   // botones, selección
  background?: string;
  text_color?: string;
  font_family?: string;     // ej. "Inter, sans-serif"
  radius?: string;          // ej. "8px"
  /** Estilo de la página pública. Sin valor = clásico. */
  style?: "clasico" | "vidrio";
  /** Fondo del estilo vidrio: solo el color principal o hasta 3 colores elegidos. */
  glass?: { mode?: "brand" | "custom"; colors?: string[]; intensity?: "soft" | "vivid" };
};

export type Client = {
  id: string;
  agency_id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  branding: Branding;
  custom_domain: string | null;
  is_active: boolean;
  embed_settings: Record<string, unknown>;
};

export type EventType = {
  id: string;
  client_id: string;
  calendar_connection_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  slot_interval_minutes: number;
  location_type: string;
  location_details: string | null;
  questions: { key: string; label: string; type: string; required: boolean }[];
  is_active: boolean;
  nylas_configuration_id: string | null;
};

export type AvailabilityRule = {
  weekday: number; // 0 = domingo
  start_time: string; // "09:00:00"
  end_time: string;
};

export type CalendarConnection = {
  id: string;
  client_id: string;
  provider: string;
  account_email: string;
  external_calendar_id: string | null;
  check_calendar_ids: string[];
  nylas_grant_id: string;
  status: string;
  grant_status: string | null;
};
