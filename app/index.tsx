import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { SearchHit, useProfile, useSession } from '../src/lib/account';
import { Btn, Card, colors, errText, H, P, Plate, s, Screen } from '../src/ui';

/* Startseite = Kennzeichensuche (auch ohne Konto), wie in der Demo */
export default function Start() {
  const { session } = useSession();
  const { profile } = useProfile(!!session);
  const [o, setO] = useState(''); const [m, setM] = useState(''); const [n, setN] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null); const [busy, setBusy] = useState(false);
  const search = async () => {
    if (!o && !m && !n) { Alert.alert('Spot my car', 'Bitte mindestens den Ort eingeben, z. B. HB.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('search_plates', { p_o: o, p_m: m, p_n: n });
    setBusy(false);
    if (error) Alert.alert('Spot my car', errText(error)); else setHits((data ?? []) as SearchHit[]);
  };
  const field = { color: '#111', fontSize: 22, fontWeight: '800' as const, textAlign: 'center' as const, paddingVertical: 10 };
  return (
    <Screen>
      <Text style={[s.title, { color: colors.red }]}>SPOT MY CAR</Text>
      <H>Kennzeichen suchen</H>
      <View style={[s.plate, { alignSelf: 'stretch' }]}>
        <View style={[s.plateEu, { paddingHorizontal: 10 }]}><Text style={{ color: '#fff', fontWeight: '800' }}>D</Text></View>
        <TextInput value={o} onChangeText={t => setO(t.toUpperCase().replace(/[^A-ZÄÖÜ]/g, '').slice(0, 3))} placeholder="HB" placeholderTextColor="#b9bec7" autoCapitalize="characters" style={[field, { flex: 3 }]} accessibilityLabel="Ort" />
        <Text style={{ color: '#1F4AA8', fontSize: 18 }}>●</Text>
        <TextInput value={m} onChangeText={t => setM(t.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} placeholder="AM" placeholderTextColor="#b9bec7" autoCapitalize="characters" style={[field, { flex: 2 }]} accessibilityLabel="Buchstaben" />
        <TextInput value={n} onChangeText={t => setN(t.toUpperCase().replace(/[^0-9EH]/g, '').slice(0, 5))} placeholder="63" placeholderTextColor="#b9bec7" keyboardType="number-pad" style={[field, { flex: 3 }]} accessibilityLabel="Zahlen" onSubmitEditing={search} />
      </View>
      <Btn label={busy ? 'Suche …' : 'Suchen'} onPress={search} disabled={busy} />
      {hits && (hits.length ? hits.map(h => (
        <Card key={h.plate}><Plate plate={h.plate} /><P>{h.make} {h.model}</P><P muted>@{h.username}</P></Card>
      )) : <P muted>Kein verifiziertes Kennzeichen gefunden.</P>)}
      <Card>
        {session ? (<>
          <P>Angemeldet als <Text style={{ fontWeight: '700' }}>@{profile?.username ?? '…'}</Text></P>
          <Btn label="Mein Profil" onPress={() => router.push('/profil')} />
          <Btn label="Live-Radar" kind="ghost" onPress={() => router.push('/radar')} />
          {profile && (profile.role === 'admin' || profile.role === 'mod') ? <Btn label={profile.role === 'admin' ? 'Admin-Bereich' : 'Moderation'} kind="ghost" onPress={() => router.push('/admin')} /> : null}
        </>) : (<>
          <P muted>Mit Konto kannst du dein Fahrzeug anlegen, verifizieren lassen und das Live-Radar nutzen.</P>
          <Btn label="Anmelden oder registrieren" onPress={() => router.push('/konto')} />
        </>)}
      </Card>
    </Screen>
  );
}
