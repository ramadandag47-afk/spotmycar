-- SPOTTED GPS MVP. Run in Supabase SQL Editor as project owner.
-- Never expose service_role credentials in the mobile application.
create table if not exists public.radar_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null check (mode in ('anonymous','visible')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.radar_private_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  accuracy_m double precision not null check (accuracy_m between 0 and 100000),
  updated_at timestamptz not null default now()
);
-- No direct client reads/writes of private locations or sessions.
alter table public.radar_sessions enable row level security;
alter table public.radar_private_locations enable row level security;
revoke all on public.radar_sessions from anon, authenticated;
revoke all on public.radar_private_locations from anon, authenticated;

create or replace function public.radar_start(p_mode text, p_minutes integer)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_mode not in ('hidden','anonymous','visible') or p_minutes not in (30,60,120) then raise exception 'Invalid settings'; end if;
  if p_mode = 'hidden' then
    delete from public.radar_private_locations where user_id=v_user;
    delete from public.radar_sessions where user_id=v_user;
    return 'hidden';
  end if;
  insert into public.radar_sessions(user_id,mode,started_at,expires_at,updated_at)
  values(v_user,p_mode,now(),now()+make_interval(mins=>p_minutes),now())
  on conflict (user_id) do update set mode=excluded.mode,started_at=excluded.started_at,expires_at=excluded.expires_at,updated_at=now();
  delete from public.radar_private_locations where user_id=v_user;
  return p_mode;
end; $$;

create or replace function public.radar_stop()
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  delete from public.radar_private_locations where user_id=v_user;
  delete from public.radar_sessions where user_id=v_user;
end; $$;

create or replace function public.radar_update(p_lat double precision,p_lon double precision,p_accuracy double precision)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_session public.radar_sessions%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_lat is null or p_lon is null or p_accuracy is null or
     not (p_lat between -90 and 90) or not (p_lon between -180 and 180) or
     not (p_accuracy between 0 and 100000) then raise exception 'Invalid location'; end if;
  select * into v_session from public.radar_sessions where user_id=v_user and expires_at>now();
  if not found then raise exception 'No active radar session'; end if;
  -- Avoid excessive location writes (minimum 10 seconds between accepted samples).
  if exists(select 1 from public.radar_private_locations where user_id=v_user and updated_at>now()-interval '10 seconds') then return; end if;
  insert into public.radar_private_locations(user_id,lat,lon,accuracy_m,updated_at)
  values(v_user,p_lat,p_lon,p_accuracy,now())
  on conflict(user_id) do update set lat=excluded.lat,lon=excluded.lon,accuracy_m=excluded.accuracy_m,updated_at=excluded.updated_at;
end; $$;

-- Grouped radar view: NO user IDs, plates or exact coordinates are returned.
-- Small groups (<3) are suppressed; use fixed 0.02-degree cells to limit pinpointing.
create or replace function public.radar_snapshot(p_lat double precision,p_lon double precision,p_radius_km double precision default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_count integer; v_visible jsonb;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_lat is null or p_lon is null or p_radius_km is null or
    not (p_lat between -90 and 90) or not (p_lon between -180 and 180) or
    p_radius_km not in (5,10,20,50) then raise exception 'Invalid search'; end if;
  with eligible as (
    select s.mode, floor(l.lat/0.02)*0.02 as cell_lat, floor(l.lon/0.02)*0.02 as cell_lon
    from public.radar_sessions s join public.radar_private_locations l using(user_id)
    where s.expires_at>now() and l.updated_at>now()-interval '3 minutes'
      and abs(l.lat-p_lat)*111.32 <= p_radius_km
      and abs(l.lon-p_lon)*111.32*greatest(abs(cos(radians(p_lat))),0.01) <= p_radius_km
  ), cells as (
    select cell_lat,cell_lon,count(*)::integer as n from eligible where mode='visible'
    group by cell_lat,cell_lon having count(*)>=3
  )
  select (select count(*)::integer from eligible),
         coalesce((select jsonb_agg(jsonb_build_object('cell_lat',cell_lat,'cell_lon',cell_lon,'count',n)) from cells),'[]'::jsonb)
  into v_count,v_visible;
  return jsonb_build_object('active_count',case when v_count>=3 then v_count else null end,'visible',v_visible);
end; $$;

revoke all on function public.radar_start(text,integer) from public,anon;
revoke all on function public.radar_stop() from public,anon;
revoke all on function public.radar_update(double precision,double precision,double precision) from public,anon;
revoke all on function public.radar_snapshot(double precision,double precision,double precision) from public,anon;
grant execute on function public.radar_start(text,integer) to authenticated;
grant execute on function public.radar_stop() to authenticated;
grant execute on function public.radar_update(double precision,double precision,double precision) to authenticated;
grant execute on function public.radar_snapshot(double precision,double precision,double precision) to authenticated;
