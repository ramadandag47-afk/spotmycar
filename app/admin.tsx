import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { useProfile, useSession } from '../src/lib/account';
import { Btn, Card, errText, Field, H, Loading, P, Plate, Screen } from '../src/ui';

type Pending = { id: string; vehicle_id: string; plate: string; username: string; created_at: string };
type Unverified = { id: string; plate: string; make: string; model: string; verified: string; username: string };

export default function Admin() {
  const { session, ready } = useSession();
  const { profile } = useProfile(!!session);
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [unverified, setUnverified] = useState<Unverified[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const admin = profile?.role === 'admin', staff = admin || profile?.role === 'mod';
  const load = useCallback(async () => {
    if (!staff) return;
    const p = await supabase.rpc('admin_pending'); if (p.error) Alert.alert('Spot my car', errText(p.error)); else setPending(p.data as Pending[]);
    if (admin) { const u = await supabase.rpc('admin_unverified'); if (!u.error) setUnverified(u.data as Unverified[]); }
  }, [staff, admin]);
  useEffect(() => { if (ready && !session) router.replace('/konto'); }, [ready, session]);
  useEffect(() => { load(); }, [load]);
  const act = async (name: string, args: object, ok: string) => {
    setBusy(true);
    const { error } = await supabase.rpc(name, args);
    setBusy(false);
    if (error) Alert.alert('Spot my car', errText(error)); else { Alert.alert('Spot my car', ok); load(); }
  };

  if (!profile) return <Screen title="Admin"><Loading /></Screen>;
  if (!staff) return <Screen title="Admin"><P>Kein Zugriff. Nur Master-Admin und Moderatoren.</P></Screen>;
  return (
    <Screen title={admin ? 'Admin-Bereich' : 'Moderation'}>
      <Pressable onPress={() => router.back()}><P muted>‹ Zurück</P></Pressable>
      <Btn label="Aktualisieren" kind="ghost" onPress={load} />
      <H>Offene Anträge{pending ? ` (${pending.length})` : ''}</H>
      {!pending ? <Loading /> : pending.length === 0 ? <P muted>Keine offenen Anträge.</P> : pending.map(r => (
        <Card key={r.id}>
          <Plate plate={r.plate} />
          <P muted>@{r.username} · {new Date(r.created_at).toLocaleString('de-DE')}</P>
          <Field label="Grund (Pflicht bei Ablehnung)" value={reasons[r.id] ?? ''} onChangeText={t => setReasons({ ...reasons, [r.id]: t })} />
          <View style={{ gap: 8 }}>
            <Btn label="Bestätigen" disabled={busy} onPress={() => act('admin_decide', { p_request: r.id, p_approve: true, p_reason: reasons[r.id] ?? '' }, 'Bestätigt und protokolliert')} />
            <Btn label="Ablehnen" kind="ghost" disabled={busy} onPress={() => act('admin_decide', { p_request: r.id, p_approve: false, p_reason: reasons[r.id] ?? '' }, 'Abgelehnt und protokolliert')} />
            {admin ? <Btn label="Ohne Fahrzeugschein freigeben" kind="ghost" disabled={busy} onPress={() => act('admin_verify_vehicle', { p_vehicle: r.vehicle_id, p_reason: reasons[r.id] ?? '' }, 'Freigegeben und protokolliert')} /> : null}
          </View>
        </Card>
      ))}
      {admin ? (<>
        <H>Ohne Fahrzeugschein freigeben</H>
        <P muted>Alle noch nicht verifizierten Kennzeichen. Prüfer und Zeitpunkt werden protokolliert.</P>
        {unverified.length === 0 ? <P muted>Alle Kennzeichen sind verifiziert.</P> : unverified.map(x => (
          <Card key={x.id}>
            <Plate plate={x.plate} />
            <P muted>{x.make} {x.model} · @{x.username}</P>
            <Btn label="Jetzt freigeben" disabled={busy} onPress={() => act('admin_verify_vehicle', { p_vehicle: x.id, p_reason: '' }, 'Freigegeben und protokolliert')} />
          </Card>
        ))}
      </>) : null}
    </Screen>
  );
}
