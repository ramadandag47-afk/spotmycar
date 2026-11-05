-- Spot my car: Konten, Fahrzeuge, Kennzeichensuche, Verifizierung und Admin.
-- Im Supabase SQL Editor NACH 001_radar.sql und 002_radar_status.sql ausführen.
-- Grundsatz: Die App liest und schreibt keine Tabelle direkt. Alles läuft über die Funktionen unten,
-- die die Identität aus dem Login (auth.uid()) ableiten und jede Regel auf dem Server prüfen.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._]{3,20}$'),
  instagram text check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$'),
  findable boolean not null default false,
  role text not null default 'user' check (role in ('user', 'mod', 'admin')),
  banned boolean not null default false,
  adult_confirmed boolean not null,
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  trial_end timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  plate text not null unique check (plate ~ '^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2} [0-9]{1,4}[EH]?$'),
  make text not null check (char_length(make) between 1 and 30),
  model text not null check (char_length(model) between 1 and 30),
  verified text not null default 'none' check (verified in ('none', 'pending', 'verified', 'rejected')),
  updated_at timestamptz not null default now()
);

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plate text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  manual boolean not null default false,
  reason text,
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists verification_one_pending on public.verification_requests(vehicle_id) where status = 'pending';

create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  detail text
);

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.verification_requests enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.profiles, public.vehicles, public.verification_requests, public.audit_log from anon, authenticated;

-- ---------- Hilfsfunktionen ----------
create or replace function public.app_role(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when p.banned then 'banned' else p.role end from public.profiles p where p.id = p_user
$$;
revoke all on function public.app_role(uuid) from public, anon, authenticated;

create or replace function public.audit(p_action text, p_detail text)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log(actor, action, detail) values (auth.uid(), p_action, p_detail)
$$;
revoke all on function public.audit(text, text) from public, anon, authenticated;

-- ---------- Registrierung: Profil entsteht automatisch beim Anlegen des Logins ----------
-- Die App schickt beim signUp in options.data: username, adult (true), terms_version.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
begin
  if v_name !~ '^[a-z0-9._]{3,20}$' then
    raise exception 'Benutzername: 3–20 Zeichen, nur a–z, 0–9, Punkt und Unterstrich.';
  end if;
  if coalesce(new.raw_user_meta_data->>'adult', '') <> 'true' then
    raise exception 'Spot my car ist erst ab 18 Jahren nutzbar.';
  end if;
  if coalesce(new.raw_user_meta_data->>'terms_version', '') = '' then
    raise exception 'Bitte den AGB zustimmen.';
  end if;
  if exists (select 1 from public.profiles where username = v_name) then
    raise exception 'Dieser Benutzername ist schon vergeben.';
  end if;
  insert into public.profiles(id, username, adult_confirmed, terms_version)
  values (new.id, v_name, true, new.raw_user_meta_data->>'terms_version');
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Vor der Registrierung prüfen (Supabase meldet Fehler aus dem Trigger sonst nur als „Database error“)
create or replace function public.username_available(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select lower(trim(coalesce(p_name, ''))) ~ '^[a-z0-9._]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(trim(p_name)))
$$;

-- ---------- Eigenes Profil ----------
create or replace function public.my_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v jsonb;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select jsonb_build_object(
    'username', p.username, 'instagram', p.instagram, 'findable', p.findable, 'role', p.role, 'banned', p.banned,
    'trial_end', p.trial_end, 'created_at', p.created_at,
    'vehicle', (select jsonb_build_object('id', ve.id, 'plate', ve.plate, 'make', ve.make, 'model', ve.model, 'verified', ve.verified,
                  'last_reason', (select r.reason from public.verification_requests r where r.vehicle_id = ve.id and r.status = 'rejected' order by r.decided_at desc limit 1))
                from public.vehicles ve where ve.owner_id = p.id))
  into v from public.profiles p where p.id = v_user;
  if v is null then raise exception 'Profil nicht gefunden.'; end if;
  return v;
end; $$;

create or replace function public.update_profile(p_username text, p_instagram text, p_findable boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_name text := lower(trim(coalesce(p_username, ''))); v_ig text := nullif(lower(trim(coalesce(p_instagram, ''))), '');
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if public.app_role(v_user) = 'banned' then raise exception 'Dieses Konto ist gesperrt.'; end if;
  if v_name !~ '^[a-z0-9._]{3,20}$' then raise exception 'Benutzername: 3–20 Zeichen, nur a–z, 0–9, Punkt und Unterstrich.'; end if;
  if exists (select 1 from public.profiles where username = v_name and id <> v_user) then raise exception 'Dieser Benutzername ist schon vergeben.'; end if;
  v_ig := regexp_replace(coalesce(v_ig, ''), '^@', '');
  if v_ig = '' then v_ig := null; end if;
  if v_ig is not null and v_ig !~ '^[a-z0-9._]{1,30}$' then raise exception 'Instagram: bitte @name angeben.'; end if;
  update public.profiles set username = v_name, instagram = v_ig, findable = coalesce(p_findable, false) where id = v_user;
end; $$;

-- ---------- Fahrzeug ----------
create or replace function public.save_vehicle(p_plate text, p_make text, p_model text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_plate text := upper(regexp_replace(trim(coalesce(p_plate, '')), '\s+', ' ', 'g'));
        v_old public.vehicles%rowtype; v_reset boolean := false;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if public.app_role(v_user) = 'banned' then raise exception 'Dieses Konto ist gesperrt.'; end if;
  if v_plate !~ '^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2} [0-9]{1,4}[EH]?$' then raise exception 'Kennzeichen ungültig. Beispiel: HB-AM 63'; end if;
  if char_length(trim(coalesce(p_make, ''))) not between 1 and 30 or char_length(trim(coalesce(p_model, ''))) not between 1 and 30 then
    raise exception 'Bitte Marke und Modell angeben (je höchstens 30 Zeichen).'; end if;
  if exists (select 1 from public.vehicles where plate = v_plate and owner_id <> v_user) then
    raise exception 'Dieses Kennzeichen ist bereits einem anderen Profil zugeordnet.'; end if;
  select * into v_old from public.vehicles where owner_id = v_user;
  if found then
    v_reset := v_old.plate <> v_plate and v_old.verified <> 'none';
    update public.vehicles set plate = v_plate, make = trim(p_make), model = trim(p_model),
      verified = case when v_old.plate <> v_plate then 'none' else verified end, updated_at = now() where owner_id = v_user;
    if v_old.plate <> v_plate then
      update public.verification_requests set status = 'withdrawn' where vehicle_id = v_old.id and status = 'pending';
    end if;
  else
    insert into public.vehicles(owner_id, plate, make, model) values (v_user, v_plate, trim(p_make), trim(p_model));
  end if;
  return jsonb_build_object('reset', v_reset);
end; $$;

-- Antrag auf Verifizierung (Version 1 ohne Foto-Upload; der Fahrzeugschein-Upload kommt mit Supabase Storage)
create or replace function public.request_verification()
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v public.vehicles%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if public.app_role(v_user) = 'banned' then raise exception 'Dieses Konto ist gesperrt.'; end if;
  select * into v from public.vehicles where owner_id = v_user;
  if not found then raise exception 'Lege zuerst dein Fahrzeugprofil an.'; end if;
  if v.verified = 'verified' then raise exception 'Dein Kennzeichen ist bereits verifiziert.'; end if;
  if exists (select 1 from public.verification_requests where vehicle_id = v.id and status = 'pending') then raise exception 'Es gibt bereits einen offenen Antrag.'; end if;
  insert into public.verification_requests(vehicle_id, owner_id, plate) values (v.id, v_user, v.plate);
  update public.vehicles set verified = 'pending' where id = v.id;
end; $$;

-- ---------- Kennzeichensuche (auch ohne Konto) ----------
-- Nur verifizierte Kennzeichen von auffindbaren, nicht gesperrten Profilen. Ort exakt, Buchstaben und Zahlen als Anfang.
create or replace function public.search_plates(p_o text, p_m text, p_n text)
returns table(plate text, make text, model text, username text)
language sql stable security definer set search_path = '' as $$
  with q as (select upper(trim(coalesce(p_o, ''))) o, upper(trim(coalesce(p_m, ''))) m, upper(trim(coalesce(p_n, ''))) n)
  select v.plate, v.make, v.model, p.username
  from public.vehicles v join public.profiles p on p.id = v.owner_id, q,
       lateral (select regexp_match(v.plate, '^([A-ZÄÖÜ]{1,3})-([A-Z]{1,2}) ([0-9]{1,4}[EH]?)$') parts) x
  where (q.o <> '' or q.m <> '' or q.n <> '')
    and v.verified = 'verified' and p.findable and not p.banned
    and (q.o = '' or x.parts[1] = q.o)
    and (q.m = '' or left(x.parts[2], length(q.m)) = q.m)
    and (q.n = '' or left(x.parts[3], length(q.n)) = q.n)
  order by v.plate limit 50
$$;

-- ---------- Admin und Moderatoren ----------
create or replace function public.admin_pending()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if public.app_role(v_user) not in ('admin', 'mod') then raise exception 'Kein Zugriff.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'vehicle_id', r.vehicle_id, 'plate', r.plate, 'username', p.username, 'created_at', r.created_at) order by r.created_at)
    from public.verification_requests r join public.profiles p on p.id = r.owner_id where r.status = 'pending'), '[]'::jsonb);
end; $$;

create or replace function public.admin_decide(p_request uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); r public.verification_requests%rowtype;
begin
  if public.app_role(v_user) not in ('admin', 'mod') then raise exception 'Kein Zugriff.'; end if;
  select * into r from public.verification_requests where id = p_request and status = 'pending';
  if not found then raise exception 'Antrag nicht gefunden oder bereits entschieden.'; end if;
  if not p_approve and char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Bitte einen Grund für die Ablehnung angeben.'; end if;
  update public.verification_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = v_user, decided_at = now() where id = r.id;
  update public.vehicles set verified = case when p_approve then 'verified' else 'rejected' end where id = r.vehicle_id;
  perform public.audit(case when p_approve then 'Kennzeichen bestätigt' else 'Kennzeichen abgelehnt' end, r.plate || coalesce(' · ' || nullif(trim(p_reason), ''), ''));
end; $$;

-- Master-Admin: Kennzeichen ohne Fahrzeugschein freigeben, auch das eigene. Begründung freiwillig.
create or replace function public.admin_verify_vehicle(p_vehicle uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v public.vehicles%rowtype; v_reason text := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Vom Master-Admin ohne Fahrzeugschein freigegeben');
begin
  if public.app_role(v_user) <> 'admin' then raise exception 'Nur der Master-Admin darf ohne Fahrzeugschein freigeben.'; end if;
  select * into v from public.vehicles where id = p_vehicle;
  if not found then raise exception 'Fahrzeug nicht gefunden.'; end if;
  if v.verified = 'verified' then raise exception 'Bereits verifiziert.'; end if;
  update public.verification_requests set status = 'withdrawn' where vehicle_id = v.id and status = 'pending';
  insert into public.verification_requests(vehicle_id, owner_id, plate, status, manual, reason, decided_by, decided_at)
  values (v.id, v.owner_id, v.plate, 'approved', true, left(v_reason, 200), v_user, now());
  update public.vehicles set verified = 'verified' where id = v.id;
  perform public.audit('Freigabe ohne Fahrzeugschein', v.plate || ' · ' || left(v_reason, 200));
end; $$;

create or replace function public.admin_unverified()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.app_role(auth.uid()) <> 'admin' then raise exception 'Nur der Master-Admin.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'plate', v.plate, 'make', v.make, 'model', v.model, 'verified', v.verified, 'username', p.username) order by v.plate)
    from public.vehicles v join public.profiles p on p.id = v.owner_id where v.verified <> 'verified'), '[]'::jsonb);
end; $$;

-- ---------- Konto selbst löschen (DSGVO Art. 17) ----------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if public.app_role(v_user) = 'admin' then raise exception 'Das Master-Admin-Konto kann hier nicht gelöscht werden.'; end if;
  delete from auth.users where id = v_user;  -- löscht Profil, Fahrzeug, Anträge und Radar-Daten mit
end; $$;

-- ---------- Rechte ----------
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.username_available(text), public.my_profile(), public.update_profile(text, text, boolean),
  public.save_vehicle(text, text, text), public.request_verification(), public.search_plates(text, text, text),
  public.admin_pending(), public.admin_decide(uuid, boolean, text), public.admin_verify_vehicle(uuid, text),
  public.admin_unverified(), public.delete_my_account() from public, anon;
grant execute on function public.username_available(text), public.search_plates(text, text, text) to anon, authenticated;
grant execute on function public.my_profile(), public.update_profile(text, text, boolean), public.save_vehicle(text, text, text),
  public.request_verification(), public.admin_pending(), public.admin_decide(uuid, boolean, text),
  public.admin_verify_vehicle(uuid, text), public.admin_unverified(), public.delete_my_account() to authenticated;

-- ---------- Dich selbst zum Master-Admin machen (einmalig, E-Mail anpassen) ----------
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'DEINE@E-MAIL.de');
