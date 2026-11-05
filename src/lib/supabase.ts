import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Bitte .env mit Supabase URL und Publishable/Anon Key ausfüllen.');

// SecureStore speichert pro Eintrag nur ca. 2 KB zuverlässig. Eine Supabase-Sitzung ist oft größer
// (Access- und Refresh-Token als JSON). Deshalb wird sie in Stücke geteilt; sonst ist man nach
// einem App-Neustart plötzlich abgemeldet oder der Hintergrund-GPS-Dienst findet keine Sitzung.
const CHUNK = 1800;
const countKey = (k: string) => `${k}__n`;
const partKey = (k: string, i: number) => `${k}__${i}`;

async function removeItem(k: string): Promise<void> {
  const n = Number(await SecureStore.getItemAsync(countKey(k))) || 0;
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(partKey(k, i));
  await SecureStore.deleteItemAsync(countKey(k));
  await SecureStore.deleteItemAsync(k);
}
async function getItem(k: string): Promise<string | null> {
  const n = Number(await SecureStore.getItemAsync(countKey(k))) || 0;
  if (!n) return SecureStore.getItemAsync(k);
  let value = '';
  for (let i = 0; i < n; i++) {
    const part = await SecureStore.getItemAsync(partKey(k, i));
    if (part === null) return null; // unvollständig gespeichert: lieber neu anmelden
    value += part;
  }
  return value;
}
async function setItem(k: string, v: string): Promise<void> {
  await removeItem(k);
  if (v.length <= CHUNK) { await SecureStore.setItemAsync(k, v); return; }
  const n = Math.ceil(v.length / CHUNK);
  for (let i = 0; i < n; i++) await SecureStore.setItemAsync(partKey(k, i), v.slice(i * CHUNK, (i + 1) * CHUNK));
  await SecureStore.setItemAsync(countKey(k), String(n));
}

export const supabase = createClient(url, key, {
  auth: { storage: { getItem, setItem, removeItem }, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Empfehlung von Supabase für Apps: Token nur im Vordergrund per Timer erneuern. Im Hintergrund erneuert
// supabase-js ein abgelaufenes Token automatisch bei der nächsten Anfrage (z. B. radar_update).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
