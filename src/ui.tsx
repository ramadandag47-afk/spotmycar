import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = { bg: '#0C0E13', card: '#191C24', line: '#2A2F3A', text: '#F5F6F8', muted: '#A9ADB8', red: '#D3241C', green: '#30D158', yellow: '#FFD60A' };

export function Screen({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {title ? <Text style={s.title}>{title}</Text> : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Card({ children }: { children: ReactNode }) { return <View style={s.card}>{children}</View>; }
export function H({ children }: { children: ReactNode }) { return <Text style={s.h}>{children}</Text>; }
export function P({ children, muted }: { children: ReactNode; muted?: boolean }) { return <Text style={muted ? s.muted : s.text}>{children}</Text>; }
export function Field(props: TextInputProps & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={s.input} {...rest} />
    </View>
  );
}
export function Btn({ label, onPress, kind = 'red', disabled }: { label: string; onPress: () => void; kind?: 'red' | 'ghost'; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [s.btn, kind === 'ghost' && s.ghost, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}
export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={s.check} accessibilityRole="checkbox" accessibilityState={{ checked: value }}>
      <View style={[s.box, value && s.boxOn]}>{value ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}</View>
      <Text style={[s.text, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}
export function Loading() { return <ActivityIndicator color={colors.red} style={{ marginTop: 40 }} />; }
/* Fehlermeldungen aus Supabase verständlich machen */
export function errText(e: any): string {
  const m = String(e?.message ?? e ?? '');
  if (/Invalid login credentials/i.test(m)) return 'E-Mail oder Passwort ist falsch.';
  if (/Email not confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der Willkommens-Mail).';
  if (/User already registered/i.test(m)) return 'Für diese E-Mail gibt es schon ein Konto.';
  if (/Database error saving new user/i.test(m)) return 'Registrierung nicht möglich. Bitte Benutzername prüfen (3–20 Zeichen, a–z, 0–9, Punkt, Unterstrich).';
  if (/rate limit|too many/i.test(m)) return 'Zu viele Versuche. Bitte kurz warten.';
  if (/Network request failed|fetch/i.test(m)) return 'Keine Verbindung. Bitte Internet prüfen.';
  if (/Token has expired|invalid.*otp|otp.*invalid/i.test(m)) return 'Der Code ist falsch oder abgelaufen.';
  return m || 'Unbekannter Fehler.';
}
export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 16, paddingBottom: 60 },
  title: { fontSize: 30, fontWeight: '900', color: colors.text },
  card: { backgroundColor: colors.card, padding: 16, borderRadius: 16, gap: 10 },
  h: { color: colors.text, fontSize: 18, fontWeight: '700' },
  text: { color: colors.text, lineHeight: 21 },
  muted: { color: colors.muted, lineHeight: 20, fontSize: 13 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  input: { color: colors.text, borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  btn: { backgroundColor: colors.red, padding: 14, borderRadius: 12, alignItems: 'center' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.red, borderColor: colors.red },
  plate: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, borderWidth: 2, borderColor: '#000', overflow: 'hidden', alignSelf: 'flex-start' },
  plateEu: { backgroundColor: '#1F4AA8', paddingHorizontal: 6, alignSelf: 'stretch', justifyContent: 'flex-end', paddingBottom: 3 },
  plateText: { color: '#111', fontWeight: '800', fontSize: 18, paddingHorizontal: 10, paddingVertical: 4, letterSpacing: 1 },
});
export function Plate({ plate }: { plate: string }) {
  return (
    <View style={s.plate}>
      <View style={s.plateEu}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>D</Text></View>
      <Text style={s.plateText}>{plate}</Text>
    </View>
  );
}
