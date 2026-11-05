import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { publishLocation } from './radar';
export const TASK_NAME = 'SPOTTED_BACKGROUND_GPS';
// Muss im globalen Modul-Scope registriert sein, nicht innerhalb einer React-Komponente.
TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Location.LocationObject[] };
  const latest = locations?.[locations.length - 1];
  if (!latest) return;
  try {
    await publishLocation(latest.coords.latitude, latest.coords.longitude, latest.coords.accuracy ?? 999);
  } catch (e: any) {
    // Offline/abgelaufene Session: keine Positionsdaten lokal puffern oder nachträglich senden.
    const msg = String(e?.message ?? e);
    // Freigabe abgelaufen oder abgemeldet: GPS im Hintergrund sofort stoppen. Vorher lief es bei
    // geschlossener App endlos weiter (Akku, Standort-Symbol), obwohl der Server nichts mehr annahm.
    // Nur eindeutige Fälle beenden; kurze Netz- oder Token-Fehler (Funkloch) dürfen eine laufende Freigabe nicht abbrechen.
    if (/No active radar session|Not authenticated/.test(msg)) {
      await endTracking().catch(() => {});
      return;
    }
    console.warn('GPS-Übertragung fehlgeschlagen:', msg);
  }
});

export async function beginTracking() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Standortberechtigung im Vordergrund fehlt.');
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') throw new Error('Hintergrundstandort nicht erlaubt. Bitte in den Geräteeinstellungen freigeben.');
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) throw new Error('Standortdienste sind ausgeschaltet.');
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) await Location.stopLocationUpdatesAsync(TASK_NAME);
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,
    timeInterval: 20000, // Android-Hinweis, keine harte Garantie
    deferredUpdatesDistance: 50,
    deferredUpdatesInterval: 20000,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
    foregroundService: { notificationTitle: 'Spot my car · Live-Radar aktiv', notificationBody: 'Dein freiwilliger Radar-Standort wird geteilt.', notificationColor: '#D3241C' },
  });
}
export async function endTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) await Location.stopLocationUpdatesAsync(TASK_NAME);
}
