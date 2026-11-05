-- Spot my car: Status der eigenen Radar-Freigabe abfragen (nach App-Neustart).
-- Im Supabase SQL Editor NACH 001_radar.sql ausführen.
-- Gibt nur die eigene Freigabe zurück (über auth.uid()), nie Daten anderer Nutzer.
create or replace function public.radar_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_session public.radar_sessions%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into v_session from public.radar_sessions where user_id = v_user and expires_at > now();
  if not found then return jsonb_build_object('mode', 'hidden', 'expires_at', null); end if;
  return jsonb_build_object('mode', v_session.mode, 'expires_at', v_session.expires_at);
end; $$;

revoke all on function public.radar_status() from public, anon;
grant execute on function public.radar_status() to authenticated;
