import { useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { beginTracking, endTracking } from '../src/location/background';
import { getSnapshot, getStatus, publishLocation, RadarMode, RadarSnapshot, startSession, stopSession } from '../src/location/radar';

const MODE_LABEL: Record<RadarMode, string> = { hidden: 'unsichtbar', anonymous: 'anonym', visible: 'sichtbar' };

const colors = { bg:'#0C0E13', card:'#191C24', text:'#F5F6F8', muted:'#A9ADB8', red:'#D3241C' };
export default function Radar() {
  const [userId, setUserId] = useState<string|null>(null);
  const [mode, setMode] = useState<RadarMode>('hidden'); const [minutes, setMinutes] = useState<30|60|120>(30);
  const [active, setActive] = useState(false); const [expiresAt, setExpiresAt] = useState<number|null>(null);
  const [snapshot, setSnapshot] = useState<RadarSnapshot|null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    // getSession liest die gespeicherte Anmeldung vom Gerät; getUser bräuchte Internet und zeigte offline fälschlich „abgemeldet“
    supabase.auth.getSession().then(({data})=>setUserId(data.session?.user?.id ?? null));
    const {data:sub}=supabase.auth.onAuthStateChange((_event, session)=>setUserId(session?.user?.id ?? null));
    return ()=>sub.subscription.unsubscribe();
  },[]);
  // Nach Login oder App-Neustart: laufende Freigabe vom Server übernehmen, statt fälschlich „aus“ anzuzeigen
  useEffect(()=>{
    if (!userId) return;
    getStatus().then(st=>{
      const until = st.expires_at ? Date.parse(st.expires_at) : NaN;
      if (st.mode !== 'hidden' && until > Date.now()) { setMode(st.mode); setExpiresAt(until); setActive(true); }
      else { setActive(false); setExpiresAt(null); endTracking().catch(console.warn); }
    }).catch(console.warn);
  },[userId]);
  useEffect(()=>{
    if (!expiresAt || !active) return;
    const t=setInterval(()=>{if(Date.now()>=expiresAt){setActive(false);setMode('hidden');endTracking().catch(console.warn);}},5000);
    return ()=>clearInterval(t);
  },[expiresAt,active]);
  useEffect(()=>{
    const s=AppState.addEventListener('change',state=>{if(state==='active' && expiresAt && Date.now()>=expiresAt){setActive(false);setMode('hidden');endTracking().catch(console.warn);}});
    return ()=>s.remove();
  },[expiresAt]);
  const run = async (f:()=>Promise<void>)=>{setBusy(true);try{await f();}catch(e:any){Alert.alert('Spot my car',e?.message||String(e));}finally{setBusy(false);}};
  const activate = ()=>run(async()=>{
    if (mode==='hidden') { await endTracking(); await stopSession(); setActive(false);setExpiresAt(null);return; }
    // Vor der Freigabe müssen alle OS-Berechtigungen erteilt werden.
    const fg=await Location.requestForegroundPermissionsAsync();
    if(fg.status!=='granted')throw new Error('Standortberechtigung nicht erteilt.');
    const bg=await Location.requestBackgroundPermissionsAsync();
    if(bg.status!=='granted')throw new Error('Hintergrundberechtigung nicht erteilt.');
    const enabled=await Location.hasServicesEnabledAsync();if(!enabled)throw new Error('GPS ist deaktiviert.');
    const current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
    await startSession(mode,minutes);
    try {
      await publishLocation(current.coords.latitude,current.coords.longitude,current.coords.accuracy??999);
      await beginTracking();
    } catch(e) {await stopSession().catch(console.warn);throw e;}
    setExpiresAt(Date.now()+minutes*60000);setActive(true);
    Alert.alert('Radar aktiviert',`Modus: ${MODE_LABEL[mode]}. Freigabe endet nach ${minutes} Minuten. Die Position kann im Hintergrund aktualisiert werden.`);
  });
  const deactivate=()=>run(async()=>{await endTracking();await stopSession();setActive(false);setMode('hidden');setExpiresAt(null);});
  const refresh=()=>run(async()=>{
    const permission=await Location.requestForegroundPermissionsAsync();if(permission.status!=='granted')throw new Error('Standortberechtigung fehlt.');
    const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
    setSnapshot(await getSnapshot(pos.coords.latitude,pos.coords.longitude));
  });
  const Button=({label,onPress}:{label:string,onPress:()=>void})=><Pressable disabled={busy} onPress={onPress} style={styles.button}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.body}>
    <Pressable onPress={()=>router.back()}><Text style={styles.sub}>‹ Zurück</Text></Pressable><Text style={styles.title}>Live-Radar</Text><Text style={styles.sub}>GPS im Hintergrund · nur mit deiner Zustimmung</Text>
    {!userId ? <View style={styles.card}><Text style={styles.heading}>Bitte anmelden</Text><Text style={styles.sub}>Das Live-Radar gibt es nur mit Konto.</Text><Button label="Zur Anmeldung" onPress={()=>router.push('/konto')}/></View> : <><View style={styles.card}><Text style={styles.heading}>Meine Sichtbarkeit</Text>
      <Text style={styles.sub}>Standardmäßig aus. Nur nach deiner Zustimmung aktiv.</Text>
      {(['hidden','anonymous','visible'] as RadarMode[]).map(m=><Pressable key={m} onPress={()=>setMode(m)} style={[styles.option,mode===m&&styles.selected]}><Text style={styles.text}>{m==='hidden'?'○ Unsichtbar (kein Radar)':m==='anonymous'?'◌ Anonym (nur Teilnehmerzahl)':'● Sichtbar (ungefähre Position)'}</Text></Pressable>)}
      <Text style={styles.heading}>Dauer</Text><View style={styles.row}>{([30,60,120] as const).map(n=><Pressable key={n} onPress={()=>setMinutes(n)} style={[styles.chip,minutes===n&&styles.selected]}><Text style={styles.text}>{n} Min.</Text></Pressable>)}</View>
      <Text style={styles.sub}>Die genaue Position bleibt privat. Sichtbare Fahrzeuge erscheinen nur als grobe Kartenbereiche. Systembedingt kann GPS im Hintergrund aussetzen.</Text>
      <Button label={active?'Freigabe neu starten / Modus wechseln':'Freigabe ausdrücklich starten'} onPress={activate}/>
      {active&&<Button label="Freigabe sofort beenden" onPress={deactivate}/>}<Text style={styles.sub}>Status: {active?'aktiv':'aus'}{expiresAt&&active?' · bis '+new Date(expiresAt).toLocaleTimeString('de-DE'):''}</Text>
    </View><View style={styles.card}><Text style={styles.heading}>Radar-Übersicht (10 km)</Text><Button label="Radar aktualisieren" onPress={refresh}/>
      <Text style={styles.text}>Aktive Teilnehmer: {!snapshot ? 'noch nicht abgefragt' : snapshot.active_count ?? 'weniger als 3 / keine'}</Text>
      <Text style={styles.sub}>Sichtbare Gruppen (ungefähre Rasterfelder): {snapshot?.visible.length??0}</Text>
      {snapshot?.visible.map((v,i)=><Text key={i} style={styles.text}>Region {v.cell_lat.toFixed(2)}, {v.cell_lon.toFixed(2)} · {v.count} sichtbar</Text>)}
    </View></>}
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:colors.bg},body:{padding:22,gap:18},title:{fontSize:34,fontWeight:'900',color:colors.red},sub:{color:colors.muted,lineHeight:21,marginVertical:7},heading:{color:colors.text,fontSize:19,fontWeight:'700',marginBottom:10},text:{color:colors.text,marginVertical:7},card:{backgroundColor:colors.card,padding:18,borderRadius:16,gap:8},input:{color:colors.text,borderColor:'#40444D',borderWidth:1,borderRadius:9,padding:12,marginBottom:6},button:{backgroundColor:colors.red,padding:14,borderRadius:10,marginVertical:5,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'700'},option:{padding:12,borderRadius:10,borderColor:'#353944',borderWidth:1},selected:{borderColor:colors.red,backgroundColor:'#392020'},row:{flexDirection:'row',gap:8},chip:{padding:10,borderRadius:8,borderWidth:1,borderColor:'#353944'}});
