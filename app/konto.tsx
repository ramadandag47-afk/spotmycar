import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { PW_RULE, pwProblem, TERMS_VERSION } from '../src/lib/account';
import { Btn, Card, Check, colors, errText, Field, H, P, Screen } from '../src/ui';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export default function Konto() {
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [username, setUsername] = useState(''); const [adult, setAdult] = useState(false); const [agb, setAgb] = useState(false);
  const [code, setCode] = useState(''); const [show, setShow] = useState(false);
  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); } catch (e) { Alert.alert('Spot my car', errText(e)); } finally { setBusy(false); } };
  const mail = () => email.trim().toLowerCase();

  const login = () => run(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: mail(), password: pw });
    if (error) throw error;
    router.replace('/');
  });
  const register = () => run(async () => {
    const name = username.trim().toLowerCase();
    if (!/^[a-z0-9._]{3,20}$/.test(name)) throw new Error('Benutzername: 3–20 Zeichen, nur a–z, 0–9, Punkt und Unterstrich.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail())) throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.');
    const pp = pwProblem(pw, name); if (pp) throw new Error(pp);
    if (pw !== pw2) throw new Error('Die beiden Passwörter stimmen nicht überein.');
    if (!adult) throw new Error('Spot my car ist erst ab 18 Jahren nutzbar.');
    if (!agb) throw new Error('Bitte den AGB zustimmen und die Datenschutzerklärung zur Kenntnis nehmen.');
    const { data: free, error: e1 } = await supabase.rpc('username_available', { p_name: name });
    if (e1) throw e1;
    if (!free) throw new Error('Dieser Benutzername ist schon vergeben.');
    const { data, error } = await supabase.auth.signUp({ email: mail(), password: pw, options: { data: { username: name, adult: 'true', terms_version: TERMS_VERSION } } });
    if (error) throw error;
    if (data.session) { router.replace('/profil'); return; }
    Alert.alert('Fast geschafft', 'Wir haben dir eine E-Mail geschickt. Tippe auf den Link darin, dann kannst du dich anmelden.');
    setMode('login'); setPw(''); setPw2('');
  });
  const forgot = () => run(async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail())) throw new Error('Bitte deine E-Mail-Adresse eingeben.');
    const { error } = await supabase.auth.resetPasswordForEmail(mail());
    if (error) throw error;
    // Gleiche Antwort für bekannte und unbekannte Adressen (verrät nicht, ob ein Konto existiert)
    Alert.alert('Prüfe dein Postfach', 'Wenn es ein Konto zu dieser Adresse gibt, haben wir dir einen 6-stelligen Code geschickt.');
    setMode('reset');
  });
  const reset = () => run(async () => {
    const pp = pwProblem(pw); if (pp) throw new Error(pp);
    if (pw !== pw2) throw new Error('Die beiden Passwörter stimmen nicht überein.');
    const { error } = await supabase.auth.verifyOtp({ email: mail(), token: code.trim(), type: 'recovery' });
    if (error) throw error;
    const { error: e2 } = await supabase.auth.updateUser({ password: pw });
    if (e2) throw e2;
    Alert.alert('Passwort geändert', 'Du bist jetzt angemeldet.');
    router.replace('/');
  });

  const tab = (k: Mode, l: string) => (
    <Pressable onPress={() => setMode(k)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: mode === k || (k === 'forgot' && mode === 'reset') ? colors.text : 'transparent' }}>
      <Text style={{ color: mode === k || (k === 'forgot' && mode === 'reset') ? '#000' : colors.text, fontWeight: '600' }}>{l}</Text>
    </Pressable>
  );
  const pwProps = { secureTextEntry: !show, autoCapitalize: 'none' as const, autoCorrect: false };
  return (
    <Screen title="Konto">
      <Pressable onPress={() => router.back()}><P muted>‹ Zurück</P></Pressable>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{tab('login', 'Anmelden')}{tab('register', 'Registrieren')}{tab('forgot', 'Passwort vergessen')}</View>
      <Card>
        {mode === 'login' && (<>
          <Field label="E-Mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
          <Field label="Passwort" value={pw} onChangeText={setPw} {...pwProps} textContentType="password" autoComplete="current-password" />
          <Check label="Passwort anzeigen" value={show} onChange={setShow} />
          <Btn label="Anmelden" onPress={login} disabled={busy} />
          <Pressable onPress={() => setMode('forgot')}><Text style={{ color: colors.red }}>Passwort vergessen?</Text></Pressable>
        </>)}
        {mode === 'register' && (<>
          <Field label="Benutzername (öffentlich)" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="z. B. chris_typer" maxLength={20} />
          <Field label="E-Mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label={`Passwort (${PW_RULE})`} value={pw} onChangeText={setPw} {...pwProps} textContentType="newPassword" autoComplete="new-password" />
          <Field label="Passwort wiederholen" value={pw2} onChangeText={setPw2} {...pwProps} textContentType="newPassword" />
          <Check label="Passwort anzeigen" value={show} onChange={setShow} />
          <Check label="Ich bin mindestens 18 Jahre alt." value={adult} onChange={setAdult} />
          <Check label="Ich akzeptiere die AGB und habe die Datenschutzerklärung gelesen." value={agb} onChange={setAgb} />
          <P muted>Alle sehen nur deinen Benutzernamen und dein Fahrzeug. Deine E-Mail sieht niemand. Du startest mit 14 Tagen Pro kostenlos, danach automatisch Basic.</P>
          <Btn label="Konto anlegen" onPress={register} disabled={busy} />
        </>)}
        {mode === 'forgot' && (<>
          <P>Gib deine E-Mail-Adresse ein. Wir schicken dir einen 6-stelligen Code.</P>
          <Field label="E-Mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Btn label="Code anfordern" onPress={forgot} disabled={busy} />
        </>)}
        {mode === 'reset' && (<>
          <H>Neues Passwort festlegen</H>
          <Field label="Code aus der E-Mail" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={8} autoComplete="one-time-code" />
          <Field label={`Neues Passwort (${PW_RULE})`} value={pw} onChangeText={setPw} {...pwProps} />
          <Field label="Passwort wiederholen" value={pw2} onChangeText={setPw2} {...pwProps} />
          <Check label="Passwort anzeigen" value={show} onChange={setShow} />
          <Btn label="Passwort speichern" onPress={reset} disabled={busy} />
        </>)}
      </Card>
    </Screen>
  );
}
