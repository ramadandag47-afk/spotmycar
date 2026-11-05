-- Spot my car: einmalige Admin-Einladung (bereits im Projekt eingespielt).
-- Wer sich mit der eingetragenen E-Mail registriert UND die E-Mail bestätigt, bekommt die Rolle. Danach ist die Einladung verbraucht.
create table if not exists public.admin_invites (email text primary key, role text not null default 'admin' check (role in ('admin','mod')));
alter table public.admin_invites enable row level security;
revoke all on public.admin_invites from anon, authenticated;
insert into public.admin_invites(email, role) values ('ramadandag@gmail.com', 'admin') on conflict (email) do nothing;

create or replace function public.apply_admin_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role text; v_rows integer;
begin
  if new.email_confirmed_at is null then return new; end if;
  select role into v_role from public.admin_invites where email = lower(new.email);
  if v_role is null then return new; end if;
  update public.profiles set role = v_role where id = new.id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return new; end if;
  delete from public.admin_invites where email = lower(new.email);
  insert into public.audit_log(actor, action, detail) values (new.id, 'Rolle per Einladung vergeben', v_role);
  return new;
end; $$;
revoke all on function public.apply_admin_invite() from public, anon, authenticated;
-- "zz_": läuft nach dem Trigger, der das Profil anlegt (Trigger laufen alphabetisch)
drop trigger if exists zz_on_auth_user_confirmed on auth.users;
create trigger zz_on_auth_user_confirmed after insert or update of email_confirmed_at on auth.users
  for each row execute function public.apply_admin_invite();
