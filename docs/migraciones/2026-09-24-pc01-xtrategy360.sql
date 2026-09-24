-- Ficha PC-01 (Xtrategy360). Aplicadas en Supabase el 24/09/2026, en este orden.

-- ===== business_id_en_clients =====
alter table public.clients add column business_id uuid;
alter table public.clients add constraint clients_business_id_key unique (business_id);
alter table public.clients add constraint clients_business_id_uuid_v4
  check (business_id is null
         or business_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
comment on column public.clients.business_id is
  'business_id de la suite (CONTRATO_BUSINESS_ID). Lo emite Xplore360; aquí solo se consume. Inmutable una vez asignado. Nullable en transición.';
create or replace function public.assert_business_id_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.business_id is not null and new.business_id is distinct from old.business_id then
    raise exception 'business_id es inmutable: el negocio % ya tiene uno asignado', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger clients_business_id_immutable
  before update of business_id on public.clients
  for each row execute function public.assert_business_id_immutable();

-- ===== agencies_slug_inmutable_y_zona_feeling =====
create or replace function public.assert_agency_slug_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'agencies.slug es inmutable (agency_slug canónico de la suite): % → %', old.slug, new.slug
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger agencies_slug_immutable
  before update of slug on public.agencies
  for each row execute function public.assert_agency_slug_immutable();
alter table public.agencies add constraint agencies_slug_canonical
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40);
update public.agencies set timezone = 'Atlantic/Canary' where slug = 'feeling';

-- ===== bookings_attribution =====
alter table public.bookings add column attribution jsonb;
alter table public.bookings add constraint bookings_attribution_is_object
  check (attribution is null or jsonb_typeof(attribution) = 'object');
create index bookings_updated_at_id_idx on public.bookings (updated_at, id);
create table public.booking_attribution_pending (
  nylas_booking_id text primary key,
  attribution jsonb not null check (jsonb_typeof(attribution) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.booking_attribution_pending enable row level security;

-- ===== api_keys_webhook_notify_all =====
alter table public.api_keys
  add column webhook_notify_all_sources boolean not null default false;
