import { useEffect, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { endTracking } from '../src/location/background';
import { stopSession } from '../src/location/radar';
import { trialDaysLeft, useProfile, useSession } from '../src/lib/account';
import { Btn, Card, Check, colors, errText, Field, H, Loading, P, Plate, Screen } from '../src/ui';

const VER_TEXT = { none: 'Noch nicht verifiziert', pending: 'Antrag in Prüfung', verified: 'Verifiziert', rejected: 'Abgelehnt' } as const;

export default function Profil() {
  const { session, ready } = useSession();
  const { profile, error, reload } = useProfile(!!session);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState(''); const [instagram, setInstagram] = useState(''); const [findable, setFindable] = useState(false);
  const [plate, setPlate] = useState(''); const [make, setMake] = useState(''); const [model, setModel] = useState('');
  useEffect(() => { if (ready && !session) router.replace('/konto'); }, [ready, session]);
  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username); setInstagram(profile.instagram ? '@' + profile.instagram : ''); setFindable(profile.findable);
    setPlate(profile.vehicle?.plate ?? ''); setMake(profile.vehicle?.make ?? ''); setModel(profile.vehicle?.model ?? '');
  }, [profile]);
  const run = async (f: () => Promise<void>, ok?: string) => { setBusy(true); try { await f(); await reload(); if (ok) Alert.alert('Spot my car', ok); } catch (e) { Alert.alert('Spot my car', errText(e)); } finally { setBusy(false); } };
  const rpc = async (name: string, args?: object) => { const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data; };

  if (!session || !profile) return <Screen title="Profil">{error ? <P muted>{errText(error)}</P> : <Loading />}</Screen>;
  const v = profile.vehicle, admin = profile.role === 'admin';
  const days = trialDaysLeft(profile);
  return (
    <Screen title="Profil">
      <Pressable onPress={() => router.back()}><P muted>‹ Zurück</P></Pressable>
      <P>@{profile.username} · {admin ? 'Master-Admin' : profile.role === 'mod' ? 'Moderator' : days > 0 ? `Testphase: noch ${days} Tage Pro` : 'Basic'}</P>
      {profile.banned ? <Card><P>Dieses Konto ist gesperrt.</P></Card> : null}

      <Card>
        <H>Fahrzeug</H>
        {v ? <Plate plate={v.plate} /> : null}
        <Field label="Kennzeichen" value={plate} onChangeText={t => setPlate(t.toUpperCase())} placeholder="HB-AM 63" autoCapitalize="characters" autoCorrect={false} />
        <Field label="Marke" value={make} onChangeText={setMake} maxLength={30} />
        <Field label="Modell" value={model} onChangeText={setModel} maxLength={30} />
        {v && v.verified !== 'none' ? <P muted>Achtung: Eine Änderung des Kennzeichens setzt die Verifizierung zurück.</P> : null}
        <Btn label="Fahrzeug speichern" disabled={busy} onPress={() => run(async () => { const r: any = await rpc('save_vehicle', { p_plate: plate, p_make: make, p_model: model }); if (r?.reset) Alert.alert('Spot my car', 'Kennzeichen geändert, Verifizierung zurückgesetzt.'); }, 'Fahrzeug gespeichert')} />
      </Card>

      {v ? (
        <Card>
          <H>Verifizierung</H>
          <Text style={{ color: v.verified === 'verified' ? colors.green : v.verified === 'rejected' ? colors.red : colors.yellow, fontWeight: '700' }}>{VER_TEXT[v.verified]}</Text>
          {v.verified === 'rejected' && v.last_reason ? <P muted>Grund: {v.last_reason}</P> : null}
          {admin && v.verified !== 'verified' ? (<>
            <P>Als Master-Admin kannst du dein Kennzeichen direkt freigeben, ohne Fahrzeugschein.</P>
            <Btn label={`${v.plate} jetzt freigeben`} disabled={busy} onPress={() => run(() => rpc('admin_verify_vehicle', { p_vehicle: v.id, p_reason: 'Eigenes Fahrzeug, vom Master-Admin freigegeben' }), 'Kennzeichen verifiziert')} />
          </>) : v.verified === 'none' || v.verified === 'rejected' ? (<>
            <P muted>Wir prüfen dein Kennzeichen. Den Foto-Upload des Fahrzeugscheins (Seite 1) ergänzen wir als Nächstes; bis dahin prüft der Master-Admin persönlich.</P>
            <Btn label="Verifizierung beantragen" disabled={busy} onPress={() => run(() => rpc('request_verification'), 'Antrag eingereicht')} />
          </>) : null}
        </Card>
      ) : null}

      <Card>
        <H>Konto und Privatsphäre</H>
        <Field label="Benutzername (öffentlich)" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={20} />
        <Field label="Instagram (optional)" value={instagram} onChangeText={setInstagram} autoCapitalize="none" autoCorrect={false} placeholder="@deinname" />
        <Check label="Von anderen gefunden werden (dein verifiziertes Kennzeichen erscheint in der Suche)" value={findable} onChange={setFindable} />
        <Btn label="Speichern" disabled={busy} onPress={() => run(() => rpc('update_profile', { p_username: username, p_instagram: instagram, p_findable: findable }), 'Gespeichert')} />
      </Card>

      {admin || profile.role === 'mod' ? <Btn label={admin ? 'Admin-Bereich' : 'Moderation'} kind="ghost" onPress={() => router.push('/admin')} /> : null}
      <Btn label="Abmelden" kind="ghost" disabled={busy} onPress={() => run(async () => { await endTracking().catch(() => {}); await stopSession().catch(() => {}); await supabase.auth.signOut(); router.replace('/'); })} />
      {!admin ? <Btn label="Konto löschen" kind="ghost" disabled={busy} onPress={() => Alert.alert('Konto löschen?', 'Profil, Fahrzeug und alle Daten werden endgültig gelöscht.', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Endgültig löschen', style: 'destructive', onPress: () => run(async () => { await endTracking().catch(() => {}); await rpc('delete_my_account'); await supabase.auth.signOut(); router.replace('/'); }) },
      ])} /> : null}
    </Screen>
  );
}
