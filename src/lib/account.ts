import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const TERMS_VERSION = '2026-11';

export type Vehicle = { id: string; plate: string; make: string; model: string; verified: 'none' | 'pending' | 'verified' | 'rejected'; last_reason: string | null };
export type Profile = { username: string; instagram: string | null; findable: boolean; role: 'user' | 'mod' | 'admin'; banned: boolean; trial_end: string; created_at: string; vehicle: Vehicle | null };
export type SearchHit = { plate: string; make: string; model: string; username: string };

/* Angemeldet? Liest die Sitzung vom Gerät und hört auf An- und Abmeldung. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

/* Eigenes Profil inkl. Fahrzeug vom Server */
export function useProfile(active: boolean) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!active) { setProfile(null); return; }
    const { data, error } = await supabase.rpc('my_profile');
    if (error) { setError(error.message); setProfile(null); } else { setError(null); setProfile(data as Profile); }
  }, [active]);
  useEffect(() => { reload(); }, [reload]);
  return { profile, error, reload };
}

export const PW_RULE = 'Mindestens 10 Zeichen, Buchstaben und Ziffern.';
const COMMON = ['passwort', 'password', '123456', 'qwertz', 'qwerty', 'hallo', 'spotmycar', 'iloveyou'];
export function pwProblem(pw: string, username = ''): string | null {
  if (pw.length < 10) return 'Das Passwort braucht mindestens 10 Zeichen.';
  if (!/[A-Za-zÄÖÜäöüß]/.test(pw) || !/\d/.test(pw)) return 'Das Passwort braucht Buchstaben und Ziffern.';
  if (COMMON.some(c => pw.toLowerCase().includes(c))) return 'Dieses Passwort ist zu leicht zu erraten.';
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return 'Das Passwort darf den Benutzernamen nicht enthalten.';
  return null;
}
export function normPlate(o: string, m: string, n: string) { return `${o.trim().toUpperCase()}-${m.trim().toUpperCase()} ${n.trim().toUpperCase()}`; }
export function trialDaysLeft(p: Profile | null) { return p ? Math.max(0, Math.ceil((Date.parse(p.trial_end) - Date.now()) / 86400000)) : 0; }
