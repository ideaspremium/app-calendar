-- Panel de agencias: equipo, invitaciones y logos.
-- Aplicada en Supabase (proyecto ttdbqismzlolphdwcxnu) como migración «panel_agencias».
-- Solo añade funciones, un espacio de archivos y sus políticas: no cambia tablas ni datos.

-- 1. Equipo de una agencia, con el correo y si ya ha entrado alguna vez.
--    auth.users no es legible desde el panel; esta función solo devuelve filas a quien es
--    de la agencia (o a la plataforma).
create or replace function public.agency_team(p_agency uuid)
returns table (user_id uuid, email text, role member_role, joined_at timestamptz, last_sign_in_at timestamptz, invited_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select m.user_id, u.email::text, m.role, m.created_at, u.last_sign_in_at, u.invited_at
  from agency_members m
  join auth.users u on u.id = m.user_id
  where m.agency_id = p_agency and is_agency_member(p_agency)
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.email
$$;

-- 2. Invitar (dueño/a o admin). Si la persona ya tiene cuenta, entra directamente en la
--    agencia ('added'). Si no, queda una invitación que consume el disparador
--    handle_new_user_invite cuando el servidor crea su usuario al enviarle el correo ('invited').
create or replace function public.agency_invite(p_agency uuid, p_email text, p_role member_role)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
  v_mine member_role;
begin
  if not is_agency_admin(p_agency) then
    raise exception 'No tienes permiso para invitar en esta agencia' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'El correo no es válido' using errcode = '22023';
  end if;
  select role into v_mine from agency_members where agency_id = p_agency and user_id = auth.uid();
  if p_role = 'owner' and not (is_platform_admin() or v_mine = 'owner') then
    raise exception 'Solo un dueño puede invitar a otro dueño' using errcode = '42501';
  end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;
  if v_user is not null then
    insert into agency_members (agency_id, user_id, role) values (p_agency, v_user, p_role)
      on conflict (agency_id, user_id) do nothing;
    if not found then return 'already_member'; end if;
    return 'added';
  end if;

  insert into pending_invites (email, agency_id, role, platform_admin, created_at, consumed_at)
    values (v_email, p_agency, p_role, false, now(), null)
    on conflict (email) do update
      set agency_id = excluded.agency_id, role = excluded.role, created_at = now(), consumed_at = null;
  return 'invited';
end $$;

-- 3. Cambiar el papel: solo un dueño (o la plataforma). La agencia nunca se queda sin dueño.
create or replace function public.agency_set_role(p_agency uuid, p_user uuid, p_role member_role)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_mine member_role; v_cur member_role;
begin
  select role into v_mine from agency_members where agency_id = p_agency and user_id = auth.uid();
  if not (is_platform_admin() or v_mine = 'owner') then
    raise exception 'Solo un dueño puede cambiar papeles' using errcode = '42501';
  end if;
  select role into v_cur from agency_members where agency_id = p_agency and user_id = p_user;
  if v_cur is null then raise exception 'Esa persona no está en la agencia'; end if;
  if v_cur = 'owner' and p_role <> 'owner'
     and (select count(*) from agency_members where agency_id = p_agency and role = 'owner') <= 1 then
    raise exception 'La agencia tiene que tener al menos un dueño';
  end if;
  update agency_members set role = p_role where agency_id = p_agency and user_id = p_user;
end $$;

-- 4. Quitar a alguien. Un dueño (o la plataforma) puede quitar a cualquiera menos al último
--    dueño. Un admin solo puede anular invitaciones de quien aún no ha entrado nunca.
create or replace function public.agency_remove_member(p_agency uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_mine member_role; v_cur member_role; v_email text; v_never boolean;
begin
  select role into v_mine from agency_members where agency_id = p_agency and user_id = auth.uid();
  select m.role, u.email, u.last_sign_in_at is null into v_cur, v_email, v_never
    from agency_members m join auth.users u on u.id = m.user_id
    where m.agency_id = p_agency and m.user_id = p_user;
  if v_cur is null then return; end if;

  if not (is_platform_admin() or v_mine = 'owner'
          or (v_mine = 'admin' and v_never and v_cur <> 'owner')) then
    raise exception 'No tienes permiso para quitar a esta persona' using errcode = '42501';
  end if;
  if v_cur = 'owner' and (select count(*) from agency_members where agency_id = p_agency and role = 'owner') <= 1 then
    raise exception 'La agencia tiene que tener al menos un dueño';
  end if;

  delete from agency_members where agency_id = p_agency and user_id = p_user;
  delete from pending_invites where lower(email) = lower(v_email) and agency_id = p_agency and consumed_at is null;
end $$;

revoke all on function public.agency_team(uuid) from public, anon;
revoke all on function public.agency_invite(uuid, text, member_role) from public, anon;
revoke all on function public.agency_set_role(uuid, uuid, member_role) from public, anon;
revoke all on function public.agency_remove_member(uuid, uuid) from public, anon;
grant execute on function public.agency_team(uuid) to authenticated;
grant execute on function public.agency_invite(uuid, text, member_role) to authenticated;
grant execute on function public.agency_set_role(uuid, uuid, member_role) to authenticated;
grant execute on function public.agency_remove_member(uuid, uuid) to authenticated;

-- 5. Logos de los negocios: espacio público (la página de reservas los enseña sin sesión).
--    Solo dueño/a o admin de la agencia del negocio puede subir o borrar, y siempre dentro de
--    la carpeta del negocio: logos/<id del negocio>/<archivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy logos_select on storage.objects for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] in (select id::text from public.clients where public.is_agency_admin(agency_id)));
create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] in (select id::text from public.clients where public.is_agency_admin(agency_id)));
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] in (select id::text from public.clients where public.is_agency_admin(agency_id)))
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] in (select id::text from public.clients where public.is_agency_admin(agency_id)));
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] in (select id::text from public.clients where public.is_agency_admin(agency_id)));
