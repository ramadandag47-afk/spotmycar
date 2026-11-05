# Spot my car – Live-Radar-App (Expo / React Native)

**Status:** Technisches MVP / Ausgangsbasis, **nicht** produktionsreif. Keine echte Karte, kein Kennzeichen-Backend, keine Zahlungen. Die bestehende HTML-App wurde nicht überschrieben. Die GPS-Freigabe ist standardmäßig deaktiviert.

## Supabase ist eingerichtet

- Projekt **spotmycar** (Region Frankfurt, kostenloser Plan): https://wudoqocvzqzokfdigvoz.supabase.co
- Alle drei Migrationen sind eingespielt (`001_radar`, `002_radar_status`, `003_konten`).
- Die Datei `.env` ist schon ausgefüllt (Projekt-URL und öffentlicher Publishable Key). Diese Werte sind kein Geheimnis. Den `service_role`/Secret Key **niemals** in die App kopieren.

### Einmal im Supabase-Dashboard einstellen (Authentication)

1. **Sign In / Providers → Email:** Mindestlänge Passwort auf **10** setzen.
2. **Emails → Templates → „Reset Password“:** in den Text `{{ .Token }}` einfügen, z. B. „Dein Code: {{ .Token }}“. Die App setzt Passwörter mit diesem 6-stelligen Code zurück.
3. **URL Configuration → Site URL:** später die Webseite von Spot my car eintragen. Bis dahin funktioniert der Bestätigungslink trotzdem (das Konto wird bestätigt, danach erscheint nur eine leere Seite).
4. Hinweis: Der eingebaute Mailversand von Supabase schickt nur wenige E-Mails pro Stunde. Für den Start einen eigenen SMTP-Dienst eintragen (Emails → SMTP Settings).

### Dich zum Master-Admin machen

Nach deiner Registrierung in der App im SQL Editor ausführen (E-Mail anpassen):

```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'DEINE@E-MAIL.de');
```

## App starten (Lenovo mit Windows 10/11)

1. Node.js LTS (https://nodejs.org/), Git (https://git-scm.com/download/win) und Android Studio (https://developer.android.com/studio) installieren. Alternativ ein Android-Handy mit USB-Debugging.
2. ZIP entpacken, PowerShell öffnen, in den Ordner wechseln, z. B. `cd $HOME\Downloads\spotmycar-app`
3. `npm install`
4. Handy anschließen oder Emulator starten, dann `npx expo run:android`

Expo Go reicht wegen GPS im Hintergrund nicht. Für iOS: Build über EAS Cloud (`npx eas-cli build --platform ios`), Apple-Entwicklerkonto nötig.

## Bildschirme

- **Start:** Kennzeichensuche in drei Feldern (auch ohne Konto). Nur verifizierte, auffindbare Kennzeichen.
- **Konto:** Registrieren (Benutzername, E-Mail, Passwort zweimal, 18+, AGB), Anmelden, Passwort vergessen mit Code per E-Mail.
- **Profil:** Fahrzeug anlegen, Verifizierung beantragen, Benutzername/Instagram/Auffindbarkeit, Abmelden, Konto löschen. Master-Admin kann das eigene Kennzeichen direkt freigeben.
- **Admin / Moderation:** offene Anträge bestätigen oder ablehnen; Master-Admin gibt jedes Kennzeichen auch ohne Fahrzeugschein frei. Alles wird protokolliert.
- **Live-Radar:** wie bisher (GPS-Freigabe 30/60/120 Minuten, nur Gruppen ab 3 Personen).

## Was bereits im Code ist

- E-Mail-Registrierung und Login über Supabase Auth, Session in Expo SecureStore.
- `expo-location` und `expo-task-manager` mit registrierter Hintergrundaufgabe.
- Drei Modi: `hidden` (aus), `anonymous` (nur Gruppenzählung), `visible` (nur gruppierte Rasterfelder).
- Zeitlimits 30/60/120 Minuten, serverseitige Ablaufprüfung.
- Geschützte SQL-RPCs; keine direkten Tabellenrechte für Clientnutzer.
- Keine Speicherung einer Standort-Historie, nur der letzte Standort.
- Anonyme Zählung und sichtbare Gruppen erst ab drei Nutzern; keine exakten Koordinaten oder Nutzerkennungen in der Radarabfrage.

## Wichtige Einschränkungen und nächste Schritte

- **Hintergrund-GPS ist nicht garantiert.** Android/iOS können Updates drosseln, nach Force-Stop unterbrechen oder Berechtigungen zurückziehen. Ein automatischer Client-Stopp exakt zum Ablaufzeitpunkt ist bei geschlossener App nicht garantiert; **der Server lehnt Updates nach Ablauf ab und liefert diese Positionen nicht aus**.
- Für eine echte Datenschutzfreigabe muss die Einwilligung verständlich dokumentiert, widerrufbar und juristisch geprüft werden; außerdem Datenschutztext, Löschkonzept und Store-Deklarationen.
- `radar_snapshot` ist ein demonstrativer, gruppierter Überblick, **keine Karte**. Vor einem öffentlichen Launch sind Missbrauchsschutz gegen wiederholte Suchabfragen, Zugriffsratenbegrenzung, Abuse-Monitoring und Privacy-Tests nötig.
- GPS-Updates laufen aktuell nur nach erfolgreichem Login und aktivem Tracking. Für robusten Hintergrundbetrieb müssen Token-Refresh, Android-Energiesparmodi, iOS-Background-Limits und Netzwerkfehler auf echten Geräten getestet werden.
- Bei Ausfall der Verbindung werden Standorte bewusst nicht gepuffert. `radar_update` akzeptiert höchstens ein Sample pro zehn Sekunden.
- `visible` gibt **keine einzelnen Fahrzeuge/Kennzeichen** aus. Die Fahrzeugprofil-Integration muss später separat mit zusätzlicher Einwilligung und Verifizierung umgesetzt werden.
- **Datenschutz:** `radar_snapshot` zählt nur aktive Sessions mit frischen Positionsdaten. Gruppengröße >=3 ist ein Mindestschutz, keine vollständige Anonymisierung. Vor Launch sind gröbere Raster, zeitliche Verzögerung und Schutz gegen Differenzangriffe zu evaluieren.
- Expo-Paketversionen sind auf SDK 54 ausgelegt. Bei Installationswarnungen: `npx expo install --fix` und `npx expo-doctor` ausführen.

## Sicherheitsmodell

- Supabase-Projekt-URL und Publishable/Anon-Key sind **öffentlich** im App-Bundle und deshalb kein Geheimnis. Zugriffsschutz erfolgt serverseitig über Auth, RLS und Security-Definer-Funktionen.
- Private Koordinaten liegen in `radar_private_locations`, auf die `anon` und `authenticated` keine direkten Tabellenrechte haben.
- Jede SQL-Funktion leitet die Identität über `auth.uid()` aus dem verifizierten JWT ab, nicht aus einem vom Client übergebenen Nutzer-ID-Feld.
- Eine Freigabe kann über `radar_stop` widerrufen werden. Nach Ablauf werden Daten nicht mehr ausgegeben; für physische Löschung alter Datensätze sollte ein geplanter Cleanup-Job eingerichtet werden.

## Testfälle

1. Ohne Anmeldung kann keine Session gestartet werden.
2. Ohne GPS- oder Hintergrundberechtigung startet keine Freigabe.
3. `hidden` beendet die Freigabe.
4. `anonymous` liefert niemals Einzelpunkte.
5. Weniger als drei aktive Nutzer werden nicht exakt gezählt.
6. Abgelaufene Session: Update wird abgelehnt, Radar zeigt sie nicht an.
7. Widerruf: Daten verschwinden sofort aus Radar-Abfragen.
8. App im Hintergrund und gesperrter Bildschirm auf echten Android-/iOS-Geräten testen.


## Änderungen vom 05.11.2026

- **Name:** App heißt jetzt „Spot my car“ (`app.json`, Paket-ID `de.spotmycar.app`, Texte der Standort-Abfragen und der Android-Mitteilung).
- **Anmeldung bleibt erhalten:** Die Supabase-Sitzung wird in SecureStore in Stücken gespeichert. SecureStore hält pro Eintrag nur etwa 2 KB zuverlässig; vorher konnte man nach einem Neustart abgemeldet sein, und der Hintergrund-GPS-Dienst hatte dann keine Sitzung.
- **Status nach Neustart:** Neue Server-Funktion `radar_status` (`002_radar_status.sql`). Nach Login oder Neustart übernimmt die App eine noch laufende Freigabe vom Server, statt „aus“ anzuzeigen; abgelaufene Freigaben beenden die Ortung.
- **GPS stoppt nach Ablauf:** Läuft die Freigabe ab, während die App geschlossen ist, beendet der Hintergrunddienst die Ortung jetzt selbst (vorher lief GPS endlos weiter).
- **Offline-Start:** Die App liest die Anmeldung vom Gerät (`getSession`) und wirkt ohne Internet nicht mehr abgemeldet.
- **Funkloch bricht Freigabe nicht ab:** Die Ortung stoppt nur bei abgelaufener Freigabe oder Abmeldung, nicht bei kurzen Netzfehlern.
- **Token-Erneuerung** nach Supabase-Empfehlung an den App-Zustand gekoppelt.
- **SafeAreaView** aus `react-native-safe-area-context` statt der in React Native 0.81 veralteten Variante.
- **Ordnerstruktur:** `app/` (Bildschirme), `src/lib`, `src/location`, `supabase/migrations` – so, wie Expo Router und die Importe es erwarten.

## Unterschied zur Klick-Demo

Die Demo zeigt im Radar Kennzeichen und Fahrzeug einzelner Mitglieder. Dieses Grundgerüst gibt bewusst nur Gruppen in groben Rasterfeldern aus (ab 3 Personen) und noch keine Kennzeichen, Karte, Ziel oder Pro-Prüfung. Das muss vor dem Start entschieden und mit Datenschutz-Prüfung ergänzt werden.

## Geprüft am 05.11.2026

- Konten-Datenbank (`003_konten.sql`) lokal: 36 von 36 Prüfungen (Registrierung mit Benutzername/18+/AGB, keine direkten Tabellenzugriffe, kein Selbst-Admin, Kennzeichen nur einmal, Suche nur verifiziert und auffindbar, Moderator/Admin-Rechte, Freigabe ohne Fahrzeugschein, Sperre, Konto löschen).
- Live im Supabase-Projekt: Registrierung → Profil → Fahrzeug → Antrag → Admin-Freigabe → Suche erfolgreich (Testdaten danach vollständig entfernt).

- Datenbank (beide Migrationen in PostgreSQL 16 mit nachgebildeten Supabase-Rollen): 29 von 29 Prüfungen, u. a. kein Zugriff ohne Anmeldung, keine direkten Tabellenzugriffe, nur 30/60/120 Minuten, Gruppen erst ab 3, keine Nutzer-IDs oder genauen Koordinaten in der Antwort, Ablauf, Beenden, Löschen.
- Geteilte Anmeldung im Gerätespeicher: 6 von 6 Prüfungen.
- Noch NICHT geprüft: echter Build und Start auf Android/iOS (braucht `npm install` und ein Gerät), GPS im Hintergrund auf echten Handys.
