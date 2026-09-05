import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView, View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, TextInput, Linking, Alert, ActivityIndicator, Platform
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { supabase } from "./src/supabase";
import PrivacyConsentModal, { usePrivacyConsent } from "./src/PrivacyConsent";
import { registerForPushNotifications } from "./src/notifications";

type Tab = "inicio" | "reservar" | "reserva" | "planes" | "contacto" | "cuenta" | "personal" | "admin";
type Service = { id:string; name:string; description?:string|null; base_price?:number|null };
type Plan = { id:string; name:string; description?:string|null; base_price?:number|null };

const PHONE = "642148996";
const WHATSAPP = "34642148996";

const FALLBACK_SERVICES: Service[] = [
  {id:"demo-1",name:"Cocinas de bares",description:"Limpieza profunda de cocinas y campanas"},
  {id:"demo-2",name:"Garajes",description:"Limpieza y desinfección de garajes y parkings"},
  {id:"demo-3",name:"Oficinas",description:"Espacios de trabajo limpios y saludables"},
  {id:"demo-4",name:"Pisos, chalets y apartamentos",description:"Limpieza general y mantenimiento"},
  {id:"demo-5",name:"Desinfecciones",description:"Higienización profesional con productos especiales"},
  {id:"demo-6",name:"Limpieza a medida",description:"Servicios personalizados para cada necesidad"},
];

const FALLBACK_PLANS: Plan[] = [
  {id:"plan-demo-1",name:"Plan Esencial",description:"Mantenimiento periódico para hogares y pequeños negocios."},
  {id:"plan-demo-2",name:"Plan Profesional",description:"Frecuencia reforzada para oficinas, locales y comunidades."},
  {id:"plan-demo-3",name:"Plan Personalizado",description:"Creamos una frecuencia y servicio adaptados a tus necesidades."},
];

export default function App() {
  const [tab, setTab] = useState<Tab>("inicio");
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const consent = usePrivacyConsent();
  const [services, setServices] = useState<Service[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authMode, setAuthMode] = useState<"login"|"register">("login");
  const [role, setRole] = useState<"client"|"staff"|"admin">("client");
  const [staffBookings, setStaffBookings] = useState<any[]>([]);
  const [adminBookings, setAdminBookings] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [adminServices, setAdminServices] = useState<any[]>([]);
  const [adminPlans, setAdminPlans] = useState<any[]>([]);
  const [servicePriceDrafts, setServicePriceDrafts] = useState<Record<string,string>>({});
  const [planPriceDrafts, setPlanPriceDrafts] = useState<Record<string,string>>({});
  const [clientList, setClientList] = useState<any[]>([]);

  const shownServices = useMemo(() => services.length ? services : FALLBACK_SERVICES, [services]);
  const shownPlans = useMemo(() => plans.length ? plans : FALLBACK_PLANS, [plans]);

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => {
      setSession(data.session);
      if (data.session?.user?.id) loadProfileRole(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user?.id) loadProfileRole(s.user.id);
      else setRole("client");
    });
    loadCatalog();
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadBookings();
    if (role === "staff" || role === "admin") loadStaffBookings();
    if (role === "admin") loadAdminData();
    const channel = supabase.channel("booking-updates")
      .on("postgres_changes", { event:"*", schema:"public", table:"bookings" }, () => {
        loadBookings();
        if (role === "staff" || role === "admin") loadStaffBookings();
        if (role === "admin") loadAdminData();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, role]);

  async function loadProfileRole(userId:string) {
    const {data} = await supabase.from("profiles").select("role").eq("id", userId).single();
    const r = (data?.role || "client") as "client"|"staff"|"admin";
    setRole(r);
    if ((r === "staff" || r === "admin") && Platform.OS !== "web") {
      registerForPushNotifications(userId).catch(() => {});
    }
  }

  async function loadCatalog() {
    const [sv, pl] = await Promise.all([
      supabase.from("services").select("id,name,description,base_price").eq("active", true).order("name"),
      supabase.from("maintenance_plans").select("id,name,description,base_price:price_per_visit").eq("active", true).order("name")
    ]);
    if (!sv.error && sv.data) {
      setServices(sv.data);
      if (sv.data.length && !serviceId) setServiceId(sv.data[0].id);
    }
    if (!pl.error && pl.data) setPlans(pl.data as any);
  }

  async function signInOrRegister() {
    if (!email || !password) return Alert.alert("Faltan datos","Escribe email y contraseña.");
    if (authMode === "login") {
      const {error} = await supabase.auth.signInWithPassword({email,password});
      if (error) Alert.alert("No se pudo iniciar sesión", error.message);
      else setTab("inicio");
    } else {
      const {error} = await supabase.auth.signUp({
        email,password,
        options:{data:{full_name:authName,phone:authPhone}}
      });
      if (error) Alert.alert("No se pudo crear la cuenta", error.message);
      else Alert.alert("Cuenta creada","Revisa tu correo si se solicita confirmación.");
    }
  }

  async function loadBookings() {
    if (!session?.user?.id) return;
    const {data,error} = await supabase.from("bookings")
      .select("id,status,scheduled_at,service_address,payment_status,customer_name,customer_phone,services(name),maintenance_plans(name)")
      .eq("client_id", session.user.id).order("created_at",{ascending:false});
    if (!error) setBookings(data || []);
  }

  async function createBooking() {
    if (!session) { setTab("cuenta"); return Alert.alert("Inicia sesión","Necesitas una cuenta para guardar la reserva."); }
    if (!services.length) return Alert.alert("Catálogo no disponible","Los servicios no se han cargado desde la base de datos. Prueba de nuevo en unos segundos.");
    if (!serviceId || !name || !phone || !address || !date) return Alert.alert("Faltan datos","Completa servicio, nombre, teléfono, dirección y fecha.");
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return Alert.alert("Fecha no válida","Usa un formato como 2026-09-05T10:00");
    const {error} = await supabase.from("bookings").insert({
      client_id:session.user.id,service_id:serviceId,maintenance_plan_id:planId,
      customer_name:name,customer_phone:phone,service_address:address,
      scheduled_at:parsed.toISOString(),notes,status:"received",payment_status:"pending",reservation_amount:20
    });
    if (error) return Alert.alert("No se pudo reservar",error.message);
    Alert.alert("Reserva creada","Tu reserva está guardada correctamente.");
    setTab("reserva"); loadBookings();
  }

  async function loadStaffBookings() {
    if (!session?.user?.id || (role !== "staff" && role !== "admin")) return;
    const {data,error} = await supabase.from("bookings")
      .select("id,status,scheduled_at,service_address,customer_name,customer_phone,assigned_staff_id,services(name)")
      .in("status", ["received","confirmed","on_the_way","in_progress"]).order("scheduled_at",{ascending:true});
    if (!error) setStaffBookings(data || []);
  }

  async function claimBooking(id:string) {
    if (!session?.user?.id) return;
    const {error}=await supabase.from("bookings").update({assigned_staff_id:session.user.id,status:"confirmed"}).eq("id",id);
    if (error) Alert.alert("No se pudo asignar",error.message); else loadStaffBookings();
  }

  async function advanceBooking(b:any) {
    const next:any={confirmed:"on_the_way",on_the_way:"in_progress",in_progress:"completed"};
    const nextStatus=next[b.status]; if(!nextStatus)return;
    const {error}=await supabase.from("bookings").update({status:nextStatus}).eq("id",b.id);
    if(error)Alert.alert("No se pudo actualizar",error.message);else loadStaffBookings();
  }

  async function loadAdminData() {
    if (!session?.user?.id || role!=="admin") return;
    const [b,st,sv,pl,cl]=await Promise.all([
      supabase.from("bookings").select("id,status,scheduled_at,service_address,customer_name,customer_phone,payment_status,assigned_staff_id,services(name)").order("created_at",{ascending:false}).limit(100),
      supabase.from("profiles").select("id,full_name,phone,role").in("role",["staff","admin"]).order("full_name"),
      supabase.from("services").select("id,name,base_price,active").order("name"),
      supabase.from("maintenance_plans").select("id,name,price_per_visit,active").order("name"),
      supabase.from("profiles").select("id,full_name,phone,role").eq("role","client").order("full_name")
    ]);
    if(!b.error)setAdminBookings(b.data||[]); if(!st.error)setStaffList(st.data||[]); if(!sv.error)setAdminServices(sv.data||[]); if(!pl.error)setAdminPlans(pl.data||[]); if(!cl.error)setClientList(cl.data||[]);
  }

  async function changeUserRole(id:string,newRole:"client"|"staff") { const {error}=await supabase.from("profiles").update({role:newRole}).eq("id",id); if(error)Alert.alert("Error",error.message);else loadAdminData(); }
  async function assignStaff(id:string,staffId:string|null) { const {error}=await supabase.from("bookings").update({assigned_staff_id:staffId,status:staffId?"confirmed":"received"}).eq("id",id); if(error)Alert.alert("Error",error.message);else loadAdminData(); }
  async function adminSetStatus(id:string,status:string) { const {error}=await supabase.from("bookings").update({status}).eq("id",id); if(error)Alert.alert("Error",error.message);else loadAdminData(); }
  async function updateServicePrice(id:string,value:string) { const price=Number(value.replace(",",".")); if(isNaN(price))return; const {error}=await supabase.from("services").update({base_price:price}).eq("id",id); if(error)Alert.alert("Error",error.message);else {Alert.alert("Guardado","Precio actualizado");loadAdminData();loadCatalog();} }
  async function updatePlanPrice(id:string,value:string) { const price=Number(value.replace(",",".")); if(isNaN(price))return; const {error}=await supabase.from("maintenance_plans").update({price_per_visit:price}).eq("id",id); if(error)Alert.alert("Error",error.message);else {Alert.alert("Guardado","Precio actualizado");loadAdminData();loadCatalog();} }

  const statusLabel=(x:string)=>({received:"Reserva recibida",confirmed:"Confirmada",on_the_way:"Personal en camino",in_progress:"Trabajo en curso",completed:"Finalizado",cancelled:"Cancelada"} as any)[x]||x;
  const openCall=()=>Linking.openURL(`tel:${PHONE}`);
  const openWhatsApp=()=>Linking.openURL(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hola, quiero información sobre un servicio de Limpiezas Isoana.")}`);
  const openMaps=(q:string="Valencia, España")=>Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);

  const navItems:[Tab,string,string][] = [
    ["inicio","Inicio","⌂"],["reservar","Reservar","▣"],["reserva","Mis reservas","▤"],["planes","Planes","☆"],["contacto","Contacto","☎"],["cuenta","Cuenta","●"]
  ];

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator size="large" style={{marginTop:80}}/></SafeAreaView>;

  return <>
    <PrivacyConsentModal visible={consent.visible} onAcceptAll={()=>consent.saveConsent(false)} onlyNecessary={()=>consent.saveConsent(true)}/>
    <SafeAreaView style={s.safe}>
      <StatusBar style="light"/>
      <View style={s.header}>
        <Image source={require("./assets/limpiezas-isoana.png")} style={s.logo}/>
        <View style={{flex:1}}><Text style={s.brand}>Limpiezas Isoana</Text><Text style={s.tag}>Limpieza profesional en Valencia y alrededores</Text></View>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {tab==="inicio" && <>
          <View style={s.heroWhite}>
            <Text style={s.heroBig}>Tu espacio más limpio,{"\n"}tu vida más fácil</Text>
            <Text style={s.heroSub}>Hogares, oficinas, locales y mucho más.</Text>
            <View style={s.featureRow}>
              {["✓\nCalidad garantizada","◒\nProductos especiales","👥\nPersonal cualificado","◷\nValencia y alrededores"].map((x,i)=><Text key={i} style={s.feature}>{x}</Text>)}
            </View>
          </View>
          <View style={s.reserveBanner}>
            <View style={{flex:1}}><Text style={s.reserveTitle}>Reserva tu limpieza a domicilio</Text><Text style={s.reserveText}>Reserva real, seguimiento del servicio y planes de mantenimiento.</Text></View>
            <TouchableOpacity style={s.whiteButton} onPress={()=>setTab("reservar")}><Text style={s.whiteButtonText}>RESERVAR AHORA ›</Text></TouchableOpacity>
          </View>
          <View style={s.sectionHeader}><Text style={s.section}>Nuestros servicios</Text><TouchableOpacity onPress={()=>setTab("reservar")}><Text style={s.link}>Ver todos ›</Text></TouchableOpacity></View>
          <View style={s.grid}>{shownServices.map((x,i)=>
            <TouchableOpacity key={x.id} style={s.card} onPress={()=>{if(services.length)setServiceId(x.id);setTab("reservar")}}>
              <View style={s.cardIcon}><Text style={s.cardIconText}>{["▰","▣","▦","⌂","✹","★"][i%6]}</Text></View>
              <Text style={s.itemTitle}>{x.name}</Text><Text style={s.itemDesc}>{x.description||"Servicio profesional a domicilio"}</Text>
              {x.base_price!=null&&<Text style={s.price}>Desde {x.base_price} € / hora</Text>}
            </TouchableOpacity>)}
          </View>
          <View style={s.trustBar}>{["▣\nReserva online","◉\nAtención directa","◆\nValencia y alrededores","✓\nResultados garantizados"].map((x,i)=><Text key={i} style={s.trustItem}>{x}</Text>)}</View>
          <View style={s.contactBanner}><View style={{flex:1}}><Text style={s.reserveTitle}>¿Tienes alguna consulta?</Text><Text style={s.reserveText}>Escríbenos por WhatsApp y te asesoramos sin compromiso.</Text></View><TouchableOpacity style={s.whiteButton} onPress={openWhatsApp}><Text style={s.whiteButtonText}>CONTACTAR</Text></TouchableOpacity></View>
        </>}

        {tab==="reservar" && <>
          <Text style={s.section}>Nueva reserva</Text>
          <View style={s.panel}><Text style={s.label}>Servicio</Text>
          {!services.length&&<View style={s.infoBox}><Text style={s.muted}>Estamos mostrando el catálogo visual. El catálogo conectado se volverá a cargar automáticamente.</Text><TouchableOpacity style={s.secondary} onPress={loadCatalog}><Text style={s.secondaryText}>VOLVER A CARGAR SERVICIOS</Text></TouchableOpacity></View>}
          {(services.length?services:shownServices).map(x=><TouchableOpacity key={x.id} style={[s.option,serviceId===x.id&&s.optionActive]} onPress={()=>services.length&&setServiceId(x.id)}><Text style={serviceId===x.id?s.optionTextActive:s.optionText}>{x.name}{x.base_price!=null?` · Desde ${x.base_price} € / hora`:""}</Text></TouchableOpacity>)}
          <Text style={[s.label,{marginTop:14}]}>Plan de mantenimiento (opcional)</Text><TouchableOpacity style={[s.option,!planId&&s.optionActive]} onPress={()=>setPlanId(null)}><Text style={!planId?s.optionTextActive:s.optionText}>Servicio puntual</Text></TouchableOpacity>
          {plans.map(x=><TouchableOpacity key={x.id} style={[s.option,planId===x.id&&s.optionActive]} onPress={()=>setPlanId(x.id)}><Text style={planId===x.id?s.optionTextActive:s.optionText}>{x.name}</Text></TouchableOpacity>)}
          <TextInput style={s.input} placeholder="Nombre y apellidos" value={name} onChangeText={setName}/><TextInput style={s.input} placeholder="Teléfono" keyboardType="phone-pad" value={phone} onChangeText={setPhone}/><TextInput style={s.input} placeholder="Dirección del servicio" value={address} onChangeText={setAddress}/><TextInput style={s.input} placeholder="Fecha: 2026-09-05T10:00" value={date} onChangeText={setDate}/><TextInput style={[s.input,{height:90}]} multiline placeholder="Observaciones" value={notes} onChangeText={setNotes}/>
          <TouchableOpacity style={s.primary} onPress={createBooking}><Text style={s.primaryText}>CONFIRMAR RESERVA</Text></TouchableOpacity></View>
        </>}

        {tab==="reserva" && <><Text style={s.section}>Mis reservas</Text>{!session?<View style={s.infoBox}><Text style={s.muted}>Inicia sesión para ver tus reservas.</Text><TouchableOpacity style={s.primary} onPress={()=>setTab("cuenta")}><Text style={s.primaryText}>INICIAR SESIÓN</Text></TouchableOpacity></View>:bookings.length===0?<View style={s.infoBox}><Text style={s.muted}>No tienes reservas todavía.</Text><TouchableOpacity style={s.primary} onPress={()=>setTab("reservar")}><Text style={s.primaryText}>HACER UNA RESERVA</Text></TouchableOpacity></View>:bookings.map(b=><View style={s.booking} key={b.id}><Text style={s.bookingCode}>{b.services?.name||"Servicio"}</Text><Text style={s.bookingLine}>{statusLabel(b.status)}</Text><Text style={s.bookingLine}>{new Date(b.scheduled_at).toLocaleString()}</Text><Text style={s.bookingLine}>{b.service_address}</Text><Text style={s.bookingLine}>Pago: {b.payment_status}</Text>{b.payment_status==="pending"&&<TouchableOpacity style={s.primary} onPress={()=>Linking.openURL(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hola, quiero realizar el pago de mi reserva de Limpiezas Isoana.")}`)}><Text style={s.primaryText}>PAGAR / CONTACTAR POR WHATSAPP</Text></TouchableOpacity>}<TouchableOpacity style={s.secondary} onPress={()=>openMaps(b.service_address)}><Text style={s.secondaryText}>VER EN GPS</Text></TouchableOpacity></View>)}</>}

        {tab==="planes" && <><Text style={s.section}>Planes de mantenimiento</Text><Text style={s.pageIntro}>Elige un plan periódico o solicita uno personalizado para tu vivienda, oficina o negocio.</Text>{shownPlans.map(p=><View style={s.planCard} key={p.id}><Text style={s.planBadge}>MANTENIMIENTO</Text><Text style={s.planName}>{p.name}</Text><Text style={s.planDesc}>{p.description}</Text>{p.base_price!=null&&<Text style={s.price}>Desde {p.base_price} € / visita</Text>}<TouchableOpacity style={s.primary} onPress={()=>{if(plans.length)setPlanId(p.id);setTab("reservar")}}><Text style={s.primaryText}>ELEGIR PLAN</Text></TouchableOpacity></View>)}</>}

        {tab==="contacto" && <><Text style={s.section}>Contacto rápido</Text><View style={s.panel}><Text style={s.contactTitle}>Estamos para ayudarte</Text><Text style={s.pageIntro}>Atención directa para presupuestos, dudas y coordinación del servicio.</Text><TouchableOpacity style={s.whatsapp} onPress={openWhatsApp}><Text style={s.primaryText}>WHATSAPP</Text></TouchableOpacity><TouchableOpacity style={s.primary} onPress={openCall}><Text style={s.primaryText}>LLAMAR {PHONE}</Text></TouchableOpacity><TouchableOpacity style={s.secondary} onPress={()=>openMaps()}><Text style={s.secondaryText}>GPS / MAPAS</Text></TouchableOpacity></View></>}

        {tab==="cuenta" && <><Text style={s.section}>{session?"Mi cuenta":authMode==="login"?"Iniciar sesión":"Crear cuenta"}</Text><View style={s.panel}>{session?<><Text style={s.contactTitle}>Sesión iniciada</Text><Text style={s.pageIntro}>{session.user?.email}</Text><TouchableOpacity style={s.primary} onPress={()=>setTab("reserva")}><Text style={s.primaryText}>VER MIS RESERVAS</Text></TouchableOpacity>{(role==="staff"||role==="admin")&&<TouchableOpacity style={s.secondary} onPress={()=>setTab("personal")}><Text style={s.secondaryText}>PANEL DEL PERSONAL</Text></TouchableOpacity>}{role==="admin"&&<TouchableOpacity style={s.secondary} onPress={()=>setTab("admin")}><Text style={s.secondaryText}>ADMINISTRACIÓN</Text></TouchableOpacity>}<TouchableOpacity style={s.secondary} onPress={()=>supabase.auth.signOut()}><Text style={s.secondaryText}>CERRAR SESIÓN</Text></TouchableOpacity></>:<>{authMode==="register"&&<><TextInput style={s.input} placeholder="Nombre completo" value={authName} onChangeText={setAuthName}/><TextInput style={s.input} placeholder="Teléfono" value={authPhone} onChangeText={setAuthPhone}/></>}<TextInput style={s.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail}/><TextInput style={s.input} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword}/><TouchableOpacity style={s.primary} onPress={signInOrRegister}><Text style={s.primaryText}>{authMode==="login"?"ENTRAR":"CREAR CUENTA"}</Text></TouchableOpacity><TouchableOpacity style={s.secondary} onPress={()=>setAuthMode(authMode==="login"?"register":"login")}><Text style={s.secondaryText}>{authMode==="login"?"NO TENGO CUENTA":"YA TENGO CUENTA"}</Text></TouchableOpacity></>}<TouchableOpacity style={s.secondary} onPress={consent.reopen}><Text style={s.secondaryText}>PRIVACIDAD</Text></TouchableOpacity></View></>}

        {tab==="personal" && <><Text style={s.section}>Panel del personal</Text>{role!=="staff"&&role!=="admin"?<View style={s.infoBox}><Text style={s.muted}>Zona exclusiva para personal autorizado.</Text></View>:staffBookings.length===0?<View style={s.infoBox}><Text style={s.muted}>No hay servicios activos pendientes.</Text></View>:staffBookings.map(b=><View style={s.booking} key={b.id}><Text style={s.bookingCode}>{b.services?.name||"Servicio"}</Text><Text style={s.bookingLine}>Cliente: {b.customer_name}</Text><Text style={s.bookingLine}>{new Date(b.scheduled_at).toLocaleString()}</Text><Text style={s.bookingLine}>{b.service_address}</Text><Text style={s.bookingLine}>{statusLabel(b.status)}</Text>{!b.assigned_staff_id&&<TouchableOpacity style={s.primary} onPress={()=>claimBooking(b.id)}><Text style={s.primaryText}>ACEPTAR SERVICIO</Text></TouchableOpacity>}{b.assigned_staff_id===session?.user?.id&&b.status!=="completed"&&<TouchableOpacity style={s.primary} onPress={()=>advanceBooking(b)}><Text style={s.primaryText}>ACTUALIZAR ESTADO</Text></TouchableOpacity>}<TouchableOpacity style={s.secondary} onPress={()=>Linking.openURL(`tel:${b.customer_phone}`)}><Text style={s.secondaryText}>LLAMAR CLIENTE</Text></TouchableOpacity><TouchableOpacity style={s.secondary} onPress={()=>openMaps(b.service_address)}><Text style={s.secondaryText}>ABRIR GPS</Text></TouchableOpacity></View>)}</>}

        {tab==="admin" && <><Text style={s.section}>Administración</Text>{role!=="admin"?<View style={s.infoBox}><Text style={s.muted}>Zona exclusiva para administradores.</Text></View>:<><Text style={s.subsection}>Reservas</Text>{adminBookings.map(b=><View style={s.booking} key={b.id}><Text style={s.bookingCode}>{b.services?.name||"Servicio"}</Text><Text style={s.bookingLine}>{b.customer_name} · {b.customer_phone}</Text><Text style={s.bookingLine}>{statusLabel(b.status)} · Pago: {b.payment_status}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:10}}>{["received","confirmed","on_the_way","in_progress","completed","cancelled"].map(st=><TouchableOpacity key={st} style={[s.chip,b.status===st&&s.chipActive]} onPress={()=>adminSetStatus(b.id,st)}><Text style={b.status===st?s.chipTextActive:s.chipText}>{statusLabel(st)}</Text></TouchableOpacity>)}</ScrollView><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:8}}><TouchableOpacity style={s.chip} onPress={()=>assignStaff(b.id,null)}><Text style={s.chipText}>Sin asignar</Text></TouchableOpacity>{staffList.filter(x=>x.role==="staff").map(st=><TouchableOpacity key={st.id} style={[s.chip,b.assigned_staff_id===st.id&&s.chipActive]} onPress={()=>assignStaff(b.id,st.id)}><Text style={b.assigned_staff_id===st.id?s.chipTextActive:s.chipText}>{st.full_name||"Trabajador"}</Text></TouchableOpacity>)}</ScrollView></View>)}<Text style={s.subsection}>Precios de servicios</Text>{adminServices.map(x=><View style={s.adminRow} key={x.id}><View style={{flex:1}}><Text style={s.adminTitle}>{x.name}</Text><TextInput style={s.input} placeholder={`Actual: ${x.base_price??"-"} €`} value={servicePriceDrafts[x.id]??""} onChangeText={v=>setServicePriceDrafts(p=>({...p,[x.id]:v}))}/></View><TouchableOpacity style={s.smallButton} onPress={()=>updateServicePrice(x.id,servicePriceDrafts[x.id]||"")}><Text style={s.smallButtonText}>GUARDAR</Text></TouchableOpacity></View>)}<Text style={s.subsection}>Planes</Text>{adminPlans.map(x=><View style={s.adminRow} key={x.id}><View style={{flex:1}}><Text style={s.adminTitle}>{x.name}</Text><TextInput style={s.input} placeholder={`Actual: ${x.price_per_visit??"-"} €`} value={planPriceDrafts[x.id]??""} onChangeText={v=>setPlanPriceDrafts(p=>({...p,[x.id]:v}))}/></View><TouchableOpacity style={s.smallButton} onPress={()=>updatePlanPrice(x.id,planPriceDrafts[x.id]||"")}><Text style={s.smallButtonText}>GUARDAR</Text></TouchableOpacity></View>)}<Text style={s.subsection}>Equipo</Text>{staffList.filter(x=>x.role==="staff").map(st=><View style={s.adminRow} key={st.id}><View><Text style={s.adminTitle}>{st.full_name||"Sin nombre"}</Text><Text style={s.muted}>{st.phone||"Sin teléfono"}</Text></View><TouchableOpacity style={s.smallButton} onPress={()=>changeUserRole(st.id,"client")}><Text style={s.smallButtonText}>QUITAR</Text></TouchableOpacity></View>)}<Text style={s.subsection}>Añadir personal</Text>{clientList.map(cl=><View style={s.adminRow} key={cl.id}><View><Text style={s.adminTitle}>{cl.full_name||"Sin nombre"}</Text><Text style={s.muted}>{cl.phone||"Sin teléfono"}</Text></View><TouchableOpacity style={s.smallButton} onPress={()=>changeUserRole(cl.id,"staff")}><Text style={s.smallButtonText}>AÑADIR</Text></TouchableOpacity></View>)}</>}</>}
      </ScrollView>

      <View style={s.nav}>{navItems.map(([k,l,ic])=><TouchableOpacity key={k} style={[s.navItem,tab===k&&s.navItemOn]} onPress={()=>setTab(k)}><Text style={[s.navIcon,tab===k&&s.navTextOn]}>{ic}</Text><Text style={[s.navText,tab===k&&s.navTextOn]}>{l}</Text></TouchableOpacity>)}</View>
    </SafeAreaView>
  </>;
}

const BLUE="#075EBE"; const DARK="#07366A"; const LIGHT="#EEF6FF";
const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#FFFFFF"},
  header:{backgroundColor:BLUE,paddingHorizontal:16,paddingVertical:12,flexDirection:"row",alignItems:"center",gap:12},
  logo:{width:60,height:60,borderRadius:30,backgroundColor:"white"},brand:{fontSize:24,fontWeight:"900",color:"white"},tag:{fontSize:12,color:"#EAF5FF",marginTop:2},
  content:{padding:14,paddingBottom:110,backgroundColor:"#FFFFFF"},
  heroWhite:{backgroundColor:"#FFFFFF",borderRadius:20,padding:18,borderWidth:1,borderColor:"#DDEBFA",marginBottom:14},
  heroBig:{fontSize:31,lineHeight:36,fontWeight:"900",color:DARK},heroSub:{fontSize:17,color:"#214F7D",marginTop:7,marginBottom:16},
  featureRow:{flexDirection:"row",justifyContent:"space-between",gap:6},feature:{flex:1,textAlign:"center",fontSize:11,lineHeight:16,fontWeight:"800",color:DARK},
  reserveBanner:{backgroundColor:BLUE,borderRadius:20,padding:16,flexDirection:"row",alignItems:"center",gap:10,marginBottom:18},reserveTitle:{fontSize:19,fontWeight:"900",color:"white"},reserveText:{fontSize:12,lineHeight:18,color:"#EAF5FF",marginTop:4},
  whiteButton:{backgroundColor:"white",paddingVertical:13,paddingHorizontal:13,borderRadius:14,alignItems:"center"},whiteButtonText:{fontSize:12,fontWeight:"900",color:BLUE},
  sectionHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},section:{fontSize:24,fontWeight:"900",color:DARK,marginTop:4,marginBottom:13},link:{color:BLUE,fontWeight:"900"},pageIntro:{fontSize:14,lineHeight:21,color:"#4A6682",marginBottom:14},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:10},card:{width:"48%",backgroundColor:"#FFFFFF",borderRadius:16,padding:14,minHeight:172,borderWidth:1,borderColor:"#DCE8F5",shadowColor:"#000",shadowOpacity:.06,shadowRadius:8,elevation:2},cardIcon:{width:42,height:42,borderRadius:12,backgroundColor:LIGHT,alignItems:"center",justifyContent:"center",marginBottom:10},cardIconText:{fontSize:22,color:BLUE,fontWeight:"900"},itemTitle:{fontSize:16,lineHeight:20,fontWeight:"900",color:DARK},itemDesc:{fontSize:12,lineHeight:18,color:"#49657F",marginTop:7},price:{fontSize:12,fontWeight:"900",color:BLUE,marginTop:8},
  trustBar:{backgroundColor:LIGHT,borderRadius:18,paddingVertical:18,paddingHorizontal:8,flexDirection:"row",marginTop:18,marginBottom:16},trustItem:{flex:1,textAlign:"center",fontSize:10,lineHeight:16,fontWeight:"800",color:DARK},contactBanner:{backgroundColor:DARK,borderRadius:20,padding:16,flexDirection:"row",alignItems:"center",gap:10},
  panel:{backgroundColor:"#FFFFFF",borderRadius:18,padding:16,borderWidth:1,borderColor:"#DCE8F5"},label:{fontSize:13,fontWeight:"900",color:DARK,marginBottom:7},
  option:{padding:13,borderRadius:12,backgroundColor:LIGHT,borderWidth:1,borderColor:"#D5E6F7",marginBottom:8},optionActive:{backgroundColor:BLUE,borderColor:BLUE},optionText:{color:DARK,fontWeight:"700"},optionTextActive:{color:"white",fontWeight:"900"},
  input:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#CFE0F2",borderRadius:12,padding:13,marginTop:10,color:DARK},
  primary:{backgroundColor:BLUE,padding:15,borderRadius:12,alignItems:"center",marginTop:12},primaryText:{color:"white",fontWeight:"900"},secondary:{borderWidth:1,borderColor:BLUE,padding:13,borderRadius:12,alignItems:"center",marginTop:10,backgroundColor:"white"},secondaryText:{color:BLUE,fontWeight:"900"},whatsapp:{backgroundColor:"#168C4A",padding:15,borderRadius:12,alignItems:"center",marginTop:12},
  infoBox:{backgroundColor:LIGHT,padding:16,borderRadius:14,borderWidth:1,borderColor:"#D8E9FA"},muted:{color:"#54708C",lineHeight:20},contactTitle:{fontSize:22,fontWeight:"900",color:DARK},
  booking:{backgroundColor:"#FFFFFF",padding:16,borderRadius:16,marginBottom:12,borderWidth:1,borderColor:"#DCE8F5"},bookingCode:{fontSize:19,fontWeight:"900",color:DARK},bookingLine:{color:"#49657F",marginTop:5},
  planCard:{backgroundColor:"#FFFFFF",padding:18,borderRadius:18,marginBottom:12,borderWidth:1,borderColor:"#DCE8F5"},planBadge:{fontSize:10,fontWeight:"900",color:BLUE},planName:{fontSize:23,fontWeight:"900",color:DARK,marginTop:6},planDesc:{color:"#536F8A",lineHeight:21,marginTop:5},
  subsection:{fontSize:18,fontWeight:"900",color:DARK,marginTop:18,marginBottom:10},chip:{paddingVertical:9,paddingHorizontal:12,borderRadius:18,borderWidth:1,borderColor:"#C8D8E8",marginRight:8,backgroundColor:"white"},chipActive:{backgroundColor:BLUE,borderColor:BLUE},chipText:{color:DARK},chipTextActive:{color:"white",fontWeight:"900"},adminRow:{backgroundColor:"white",padding:14,borderRadius:14,marginBottom:9,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:"#DCE8F5"},adminTitle:{fontSize:15,fontWeight:"900",color:DARK},smallButton:{backgroundColor:BLUE,paddingVertical:10,paddingHorizontal:12,borderRadius:10},smallButtonText:{color:"white",fontWeight:"900",fontSize:11},
  nav:{position:"absolute",left:0,right:0,bottom:0,backgroundColor:DARK,flexDirection:"row",paddingHorizontal:5,paddingTop:8,paddingBottom:10,borderTopLeftRadius:20,borderTopRightRadius:20},navItem:{flex:1,alignItems:"center",paddingVertical:7,borderRadius:12},navItemOn:{backgroundColor:"white"},navIcon:{fontSize:18,color:"#B7D7F5",fontWeight:"900"},navText:{fontSize:9,color:"#D7EAFC",marginTop:3,fontWeight:"700"},navTextOn:{color:BLUE,fontWeight:"900"}
});