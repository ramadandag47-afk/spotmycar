import { supabase } from '../lib/supabase';
export type RadarMode = 'hidden' | 'anonymous' | 'visible';
export type RadarSnapshot = { active_count: number | null; visible: { cell_lat: number; cell_lon: number; count: number }[] };

export async function startSession(mode: RadarMode, minutes: 30 | 60 | 120) {
  const { data, error } = await supabase.rpc('radar_start', { p_mode: mode, p_minutes: minutes });
  if (error) throw error;
  return data as string;
}
export type RadarStatus = { mode: RadarMode; expires_at: string | null };
// Eigene Freigabe vom Server lesen, z. B. nach einem App-Neustart (braucht 002_radar_status.sql).
export async function getStatus(): Promise<RadarStatus> {
  const { data, error } = await supabase.rpc('radar_status');
  if (error) throw error;
  return data as RadarStatus;
}
export async function stopSession() {
  const { error } = await supabase.rpc('radar_stop');
  if (error) throw error;
}
export async function publishLocation(lat: number, lon: number, accuracy: number) {
  const { error } = await supabase.rpc('radar_update', { p_lat: lat, p_lon: lon, p_accuracy: accuracy });
  if (error) throw error;
}
export async function getSnapshot(lat: number, lon: number, radiusKm = 10): Promise<RadarSnapshot> {
  const { data, error } = await supabase.rpc('radar_snapshot', { p_lat: lat, p_lon: lon, p_radius_km: radiusKm });
  if (error) throw error;
  return data as RadarSnapshot;
}
