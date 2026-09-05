import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ImageBackground,
  TouchableOpacity,
  TextInput,
  Linking,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { supabase } from "./src/supabase";
import PrivacyConsentModal, { usePrivacyConsent } from "./src/PrivacyConsent";
import { registerForPushNotifications } from "./src/notifications";

type Tab = "inicio" | "reservar" | "reserva" | "planes" | "contacto" | "cuenta" | "personal" | "admin";
type Service = { id:string; name:string; description?:string|null; base_price?:number|null; active?:boolean|null };
type Plan = { id:string; name:string; description?:string|null; base_price?:number|null };

const PHONE = "642148996";
const WHATSAPP = "34642148996";
const BLUE = "#0B4B86";
const BLUE2 = "#0866C6";
const LIGHT = "#F4F9FD";

const HERO_IMAGE = "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1400&q=85";

const SERVICE_PRESETS = [
  {
    keys:["cocina","campana","bar"],
    title:"Cocinas de bares",
    description:"Limpieza profunda de cocinas y campanas",
    price:90,
    icon:"▣",
    image:"https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=85"
  },
  {
    keys:["garaje","parking"],
    title:"Garajes",
    description:"Limpieza y desinfección de garajes y parkings",
    price:80,
    icon:"▰",
    image:"https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=900&q=85"
  },
  {
    keys:["oficina","local","empresa"],
    title:"Oficinas",
    description:"Espacios de trabajo limpios y saludables",
    price:70,
    icon:"▦",
    image:"https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=85"
  },
  {
    keys:["piso","chalet","apartamento","hogar","casa"],
    title:"Pisos, chalets y apartamentos",
    description:"Limpieza general y mantenimiento",
    price:60,
    icon:"⌂",
    image:"https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=85"
  },
  {
    keys:["desinfec","higien"],
    title:"Desinfecciones",
    description:"Higienización profesional con productos especiales",
    price:100,
    icon:"✹",
    image:"https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=85"
  },
  {
    keys:["medida","personaliz","especial"],
    title:"Limpieza a medida",
    description:"Servicios personalizados para cada necesidad",
    price:50,
    icon:"★",
    image:"https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=900&q=85"
  }
];

function normalize(v:string="") {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function visualFor(name:string) {
  const n = normalize(name);
  return SERVICE_PRESETS.find(p => p.keys.some(k => n.includes(k))) || {
    title:name || "Servicio de limpieza",
    description:"Limpieza profesional adaptada a tus necesidades",
    price:50,
    icon:"✦",
    image:"https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=900&q=85"
  };
}

function displayPrice(svc:Service) {
  return svc.base_price ?? visualFor(svc.name).price;
}

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
  const [clientList, setClientList] = useState<any[]>([]);
  const [servicePriceDrafts, setServicePriceDrafts] = useState<Record<string,string>>({});
  const [serviceDescriptionDrafts, setServiceDescriptionDrafts] = useState<Record<string,string>>({});
  const [planPriceDrafts, setPlanPriceDrafts] = useState<Record<string,string>>({});

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
    if (!session?.user?.id) {
      setBookings([]);
      setStaffBookings([]);
      return;
    }
    loadBookings();
    if (role === "staff" || role === "admin") loadStaffBookings();
    if (role === "admin") loadAdminData();
    const channel = supabase.channel("booking-updates")
      .on("postgres_changes", { event:"*", schema:"public", table:"bookings" }, (payload:any) => {
        loadBookings();
        if (role === "staff" || role === "admin") loadStaffBookings();
        if (role === "admin") loadAdminData();
        if (payload.eventType === "INSERT" && (role === "staff" || role === "admin")) {
          Alert.alert("Nueva reserva", `${payload.new?.customer_name || "Un cliente"} ha reservado un servicio.`);
        }
      })
      .subscribe();
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
    const [{data:s,error:se},{data:p,error:pe}] = await Promise.all([
      supabase.from("services").select("id,name,description,base_price,active").eq("active", true).order("name"),
      supabase.from("maintenance_plans").select("id,name,description,base_price:price_per_visit").eq("active", true).order("name")
    ]);
    if (!se && s) {
      setServices(s);
      if (s.length) setServiceId(prev => prev || s[0].id);
    }
    if (!pe && p) setPlans(p);
  }

  async function loadBookings() {
    if (!session?.user?.id) return;
    const {data,error} = await supabase
      .from("bookings")
      .select("id,status,scheduled_at,service_address,payment_status,customer_name,customer_phone,services(name),maintenance_plans(name)")
      .eq("client_id", session.user.id)
      .order("created_at",{ascending:false});
    if (!error) setBookings(data || []);
  }

  async function loadStaffBookings() {
    if (!session?.user?.id || (role !== "staff" && role !== "admin")) return;
    const {data,error} = await supabase
      .from("bookings")
      .select("id,status,scheduled_at,service_address,customer_name,customer_phone,assigned_staff_id,services(name),maintenance_plans(name)")
      .in("status", ["received","confirmed","on_the_way","in_progress"])
      .order("scheduled_at",{ascending:true});
    if (!error) setStaffBookings(data || []);
  }

  async function loadAdminData() {
    if (!session?.user?.id || role !== "admin") return;
    const [b, st, sv, pl, cl] = await Promise.all([
      supabase.from("bookings").select("id,status,scheduled_at,service_address,customer_name,customer_phone,payment_status,assigned_staff_id,services(name)").order("created_at",{ascending:false}).limit(100),
      supabase.from("profiles").select("id,full_name,phone,role").in("role",["staff","admin"]).order("full_name"),
      supabase.from("services").select("id,name,description,base_price,active").order("name"),
      supabase.from("maintenance_plans").select("id,name,description,price_per_visit,active").order("name"),
      supabase.from("profiles").select("id,full_name,phone,role").eq("role","client").order("full_name")
    ]);
    if (!b.error) setAdminBookings(b.data || []);
    if (!st.error) setStaffList(st.data || []);
    if (!sv.error) {
      setAdminServices(sv.data || []);
      const priceDrafts:Record<string,string> = {};
      const descDrafts:Record<string,string> = {};
      (sv.data || []).forEach((x:any) => {
        priceDrafts[x.id] = x.base_price == null ? String(visualFor(x.name).price) : String(x.base_price);
        descDrafts[x.id] = x.description || visualFor(x.name).description;
      });
      setServicePriceDrafts(priceDrafts);
      setServiceDescriptionDrafts(descDrafts);
    }
    if (!pl.error) {
      setAdminPlans(pl.data || []);
      const drafts:Record<string,string> = {};
      (pl.data || []).forEach((x:any) => drafts[x.id] = x.price_per_visit == null ? "" : String(x.price_per_visit));
      setPlanPriceDrafts(drafts);
    }
    if (!cl.error) setClientList(cl.data || []);
  }

  async function signInOrRegister() {
    if (!email || !password) return Alert.alert("Faltan datos","Escribe email y contraseña.");
    if (authMode === "login") {
      const {error} = await supabase.auth.signInWithPassword({email,password});
      if (error) Alert.alert("No se pudo iniciar sesión", error.message);
      else setTab("inicio");
      return;
    }
    const webRedirect = Platform.OS === "web" && typeof window !== "undefined" ? window.location.href.split("?")[0].split("#")[0] : "limpiezasisoana://auth/callback";
    const {error} = await supabase.auth.signUp({
      email,
      password,
      options:{ data:{full_name:authName,phone:authPhone}, emailRedirectTo:webRedirect }
    });
    if (error) Alert.alert("No se pudo crear la cuenta", error.message);
    else Alert.alert("Cuenta creada","Revisa tu correo si se solicita confirmación.");
  }

  async function createBooking() {
    if (!session) {
      Alert.alert("Inicia sesión","Necesitas una cuenta para guardar tu reserva.");
      setTab("cuenta");
      return;
    }
    if (!serviceId || !name || !phone || !address || !date) return Alert.alert("Faltan datos","Completa servicio, nombre, teléfono, dirección y fecha.");
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return Alert.alert("Fecha no válida","Usa un formato como 2026-09-05T10:00");
    const {data:created,error} = await supabase.from("bookings").insert({
      client_id:session.user.id,
      service_id:serviceId,
      maintenance_plan_id:planId,
      customer_name:name,
      customer_phone:phone,
      service_address:address,
      scheduled_at:parsed.toISOString(),
      notes,
      status:"received",
      payment_status:"pending",
      reservation_amount:20
    }).select("id").single();
    if (error) return Alert.alert("No se pudo reservar",error.message);
    if (created?.id) {
      const { error: notifyError } = await supabase.functions.invoke("notify-new-booking", { body: { booking_id: created.id } });
      if (notifyError) console.warn("No se pudo enviar la notificación de reserva", notifyError.message);
    }
    Alert.alert("Reserva creada","Tu reserva ya está guardada.");
    setTab("reserva");
    loadBookings();
  }

  async function claimBooking(bookingId:string) {
    if (!session?.user?.id) return;
    const {error} = await supabase.from("bookings").update({assigned_staff_id:session.user.id,status:"confirmed"}).eq("id",bookingId);
    if (error) Alert.alert("No se pudo asignar",error.message); else loadStaffBookings();
  }

  async function advanceBooking(b:any) {
    const next:any = {confirmed:"on_the_way",on_the_way:"in_progress",in_progress:"completed"};
    const nextStatus = next[b.status];
    if (!nextStatus) return;
    const {error} = await supabase.from("bookings").update({status:nextStatus}).eq("id",b.id);
    if (error) Alert.alert("No se pudo actualizar",error.message); else loadStaffBookings();
  }

  async function assignStaff(bookingId:string, staffId:string|null) {
    const {error} = await supabase.from("bookings").update({assigned_staff_id:staffId,status:staffId?"confirmed":"received"}).eq("id",bookingId);
    if (error) Alert.alert("No se pudo asignar",error.message); else loadAdminData();
  }

  async function adminSetStatus(bookingId:string,status:string) {
    const {error} = await supabase.from("bookings").update({status}).eq("id",bookingId);
    if (error) Alert.alert("No se pudo cambiar el estado",error.message); else loadAdminData();
  }

  async function markPaid(bookingId:string) {
    const {error} = await supabase.from("bookings").update({payment_status:"paid"}).eq("id",bookingId);
    if (error) Alert.alert("Error",error.message); else { Alert.alert("Pago actualizado","La reserva está marcada como pagada."); loadAdminData(); loadBookings(); }
  }

  async function saveService(service:any) {
    const raw = servicePriceDrafts[service.id] ?? "";
    const price = Number(raw.replace(",","."));
    if (!Number.isFinite(price) || price < 0) return Alert.alert("Precio no válido","Introduce un precio correcto.");
    const description = (serviceDescriptionDrafts[service.id] || "").trim();
    const {error} = await supabase.from("services").update({base_price:price,description}).eq("id",service.id);
    if (error) return Alert.alert("No se pudo guardar",error.message);
    Alert.alert("Servicio actualizado",`${service.name}: ${price} €`);
    await Promise.all([loadAdminData(),loadCatalog()]);
  }

  async function toggleService(service:any) {
    const {error} = await supabase.from("services").update({active:!service.active}).eq("id",service.id);
    if (error) Alert.alert("No se pudo cambiar",error.message); else { loadAdminData(); loadCatalog(); }
  }

  async function savePlan(plan:any) {
    const raw = planPriceDrafts[plan.id] ?? "";
    const price = Number(raw.replace(",","."));
    if (!Number.isFinite(price) || price < 0) return Alert.alert("Precio no válido","Introduce un precio correcto.");
    const {error} = await supabase.from("maintenance_plans").update({price_per_visit:price}).eq("id",plan.id);
    if (error) Alert.alert("No se pudo guardar",error.message); else { Alert.alert("Plan actualizado",`${plan.name}: ${price} €`); loadAdminData(); loadCatalog(); }
  }

  async function changeUserRole(profileId:string,newRole:"client"|"staff") {
    const {error} = await supabase.from("profiles").update({role:newRole}).eq("id",profileId);
    if (error) Alert.alert("No se pudo cambiar el usuario",error.message); else loadAdminData();
  }

  const statusLabel = (v:string) => ({received:"Reserva recibida",confirmed:"Confirmada",on_the_way:"Personal en camino",in_progress:"Trabajo en curso",completed:"Finalizado",cancelled:"Cancelada"} as any)[v] || v;
  const openCall = () => Linking.openURL(`tel:${PHONE}`);
  const openWhatsApp = (text="Hola, quiero información sobre un servicio de Limpiezas Isoana.") => Linking.openURL(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`);
  const openMaps = (q:string="Valencia, España") => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);

  const navItems = useMemo(() => [
    ["inicio","⌂","Inicio"],["reservar","▣","Reservar"],["reserva","▤","Mis reservas"],["planes","☆","Planes"],["contacto","☎","Contacto"],["cuenta","●","Cuenta"],
    ...((role === "staff" || role === "admin") ? [["personal","♟","Personal"]] : []),
    ...(role === "admin" ? [["admin","⚙","Admin"]] : [])
  ] as string[][],[role]);

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:90}} size="large" color={BLUE2}/></SafeAreaView>;

  return (
    <>
      <PrivacyConsentModal visible={consent.visible} onAcceptAll={()=>consent.saveConsent(false)} onlyNecessary={()=>consent.saveConsent(true)} />
      <SafeAreaView style={s.safe}>
        <StatusBar style="light" />
        <View style={s.header}>
          <Image source={require("./assets/limpiezas-isoana.png")} style={s.logo}/>
          <View style={{flex:1}}>
            <Text style={s.brand}>Limpiezas Isoana</Text>
            <Text style={s.tag}>Limpieza profesional en Valencia y alrededores</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.content}>
          {tab === "inicio" && <>
            <ImageBackground source={{uri:HERO_IMAGE}} style={s.heroImage} imageStyle={s.heroImageInner}>
              <View style={s.heroShade}>
                <Text style={s.heroTitle}>Tu espacio más limpio,{"\n"}tu vida más fácil</Text>
                <Text style={s.heroSub}>Hogares, oficinas, locales y mucho más.</Text>
                <View style={s.benefitsRow}>
                  <MiniBenefit icon="✓" label="Calidad\ngarantizada"/>
                  <MiniBenefit icon="●" label="Productos\nespeciales"/>
                  <MiniBenefit icon="♟" label="Personal\ncualificado"/>
                  <MiniBenefit icon="⌖" label="Valencia y\nalrededores"/>
                </View>
              </View>
            </ImageBackground>

            <View style={s.bookingBanner}>
              <View style={{flex:1,paddingRight:12}}>
                <Text style={s.bannerTitle}>Reserva tu limpieza a domicilio</Text>
                <Text style={s.bannerText}>Reserva real, seguimiento del servicio y planes de mantenimiento.</Text>
              </View>
              <TouchableOpacity style={s.whiteButton} onPress={()=>setTab("reservar")}>
                <Text style={s.whiteButtonText}>RESERVAR AHORA ›</Text>
              </TouchableOpacity>
            </View>

            <View style={s.sectionRow}>
              <Text style={s.section}>Nuestros servicios</Text>
              <TouchableOpacity onPress={()=>setTab("reservar")}><Text style={s.link}>Ver todos ›</Text></TouchableOpacity>
            </View>

            {services.length === 0 ? <View style={s.infoBox}><Text style={s.muted}>Cargando servicios…</Text></View> :
            <View style={s.grid}>{services.map(x => {
              const v = visualFor(x.name);
              return <TouchableOpacity key={x.id} style={s.serviceCard} onPress={()=>{setServiceId(x.id);setTab("reservar")}}>
                <Image source={{uri:v.image}} style={s.serviceImage}/>
                <View style={s.serviceBody}>
                  <View style={s.iconSquare}><Text style={s.iconText}>{v.icon}</Text></View>
                  <Text style={s.serviceName}>{x.name}</Text>
                  <Text style={s.serviceDescription}>{x.description || v.description}</Text>
                  <Text style={s.price}>Desde {displayPrice(x)} €</Text>
                  <View style={s.reserveMini}><Text style={s.reserveMiniText}>Reservar</Text></View>
                </View>
              </TouchableOpacity>
            })}</View>}

            <View style={s.trustPanel}>
              <TrustItem icon="▣" title="Reserva online" subtitle="Fácil y rápido"/>
              <TrustItem icon="●" title="Atención directa" subtitle="WhatsApp"/>
              <TrustItem icon="⌖" title="Valencia y alrededores" subtitle="Tu zona de confianza"/>
              <TrustItem icon="✓" title="Resultados garantizados" subtitle="Calidad en cada servicio"/>
            </View>

            <View style={s.contactBanner}>
              <View style={{flex:1}}><Text style={s.bannerTitle}>¿Tienes alguna consulta?</Text><Text style={s.bannerText}>Escríbenos por WhatsApp y te asesoramos sin compromiso.</Text></View>
              <TouchableOpacity style={s.whiteButton} onPress={()=>openWhatsApp()}><Text style={s.whiteButtonText}>WHATSAPP</Text></TouchableOpacity>
            </View>
          </>}

          {tab === "reservar" && <>
            <Text style={s.pageTitle}>Nueva reserva</Text>
            <Text style={s.pageIntro}>Elige el servicio y completa tus datos.</Text>
            <Text style={s.label}>Servicio</Text>
            {services.map(x => {
              const v = visualFor(x.name);
              return <TouchableOpacity key={x.id} style={[s.selectCard,serviceId===x.id&&s.selectCardOn]} onPress={()=>setServiceId(x.id)}>
                <Image source={{uri:v.image}} style={s.selectThumb}/>
                <View style={{flex:1}}><Text style={[s.selectTitle,serviceId===x.id&&{color:"white"}]}>{x.name}</Text><Text style={[s.selectPrice,serviceId===x.id&&{color:"#EAF5FF"}]}>Desde {displayPrice(x)} €</Text></View>
              </TouchableOpacity>
            })}
            <Text style={[s.label,{marginTop:18}]}>Plan de mantenimiento (opcional)</Text>
            <TouchableOpacity style={[s.option,!planId&&s.optionActive]} onPress={()=>setPlanId(null)}><Text style={!planId?s.optionTextActive:s.optionText}>Servicio puntual</Text></TouchableOpacity>
            {plans.map(x=><TouchableOpacity key={x.id} style={[s.option,planId===x.id&&s.optionActive]} onPress={()=>setPlanId(x.id)}><Text style={planId===x.id?s.optionTextActive:s.optionText}>{x.name}{x.base_price != null ? ` · ${x.base_price} €` : ""}</Text></TouchableOpacity>)}
            <TextInput style={s.input} placeholder="Nombre y apellidos" value={name} onChangeText={setName}/>
            <TextInput style={s.input} placeholder="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
            <TextInput style={s.input} placeholder="Dirección del servicio" value={address} onChangeText={setAddress}/>
            <TextInput style={s.input} placeholder="Fecha: 2026-09-05T10:00" value={date} onChangeText={setDate}/>
            <TextInput style={[s.input,{height:100,textAlignVertical:"top"}]} multiline placeholder="Observaciones" value={notes} onChangeText={setNotes}/>
            <TouchableOpacity style={s.primary} onPress={createBooking}><Text style={s.primaryText}>CONFIRMAR RESERVA</Text></TouchableOpacity>
          </>}

          {tab === "reserva" && <>
            <Text style={s.pageTitle}>Mis reservas</Text>
            {!session ? <View style={s.infoBox}><Text style={s.muted}>Inicia sesión para ver tus reservas.</Text><TouchableOpacity style={s.primary} onPress={()=>setTab("cuenta")}><Text style={s.primaryText}>INICIAR SESIÓN</Text></TouchableOpacity></View> :
            bookings.length===0 ? <View style={s.infoBox}><Text style={s.muted}>No tienes reservas todavía.</Text><TouchableOpacity style={s.primary} onPress={()=>setTab("reservar")}><Text style={s.primaryText}>HACER UNA RESERVA</Text></TouchableOpacity></View> :
            bookings.map(b=><View style={s.bookingCard} key={b.id}>
              <Text style={s.bookingCode}>{b.services?.name || "Servicio"}</Text>
              <Text style={s.statusPill}>{statusLabel(b.status)}</Text>
              <Text style={s.bookingLine}>{new Date(b.scheduled_at).toLocaleString()}</Text>
              <Text style={s.bookingLine}>{b.service_address}</Text>
              <Text style={s.bookingLine}>Pago: {b.payment_status}</Text>
              {b.payment_status === "pending" && <TouchableOpacity style={s.whatsapp} onPress={()=>openWhatsApp(`Hola, quiero realizar el pago de mi reserva de Limpiezas Isoana.\nServicio: ${b.services?.name || "Limpieza"}\nFecha: ${new Date(b.scheduled_at).toLocaleString()}`)}><Text style={s.primaryText}>PAGAR / CONTACTAR POR WHATSAPP</Text></TouchableOpacity>}
              <TouchableOpacity style={s.secondary} onPress={()=>openMaps(b.service_address)}><Text style={s.secondaryText}>VER EN GPS</Text></TouchableOpacity>
            </View>)}
          </>}

          {tab === "planes" && <>
            <Text style={s.pageTitle}>Planes de mantenimiento</Text>
            <Text style={s.pageIntro}>Soluciones periódicas para hogares, empresas y comunidades.</Text>
            {plans.length===0 ? <View style={s.infoBox}><Text style={s.muted}>No hay planes disponibles ahora mismo.</Text></View> : plans.map(p=><View style={s.planCard} key={p.id}>
              <Text style={s.planTag}>MANTENIMIENTO</Text>
              <Text style={s.planName}>{p.name}</Text>
              <Text style={s.planDesc}>{p.description}</Text>
              {p.base_price != null && <Text style={s.planPrice}>Desde {p.base_price} €</Text>}
              <TouchableOpacity style={s.primary} onPress={()=>{setPlanId(p.id);setTab("reservar")}}><Text style={s.primaryText}>ELEGIR PLAN</Text></TouchableOpacity>
            </View>)}
          </>}

          {tab === "contacto" && <>
            <Text style={s.pageTitle}>Contacto rápido</Text>
            <View style={s.contactCard}><Text style={s.contactIcon}>●</Text><Text style={s.contactTitle}>WhatsApp</Text><Text style={s.muted}>Respuesta directa para presupuestos y consultas.</Text><TouchableOpacity style={s.whatsapp} onPress={()=>openWhatsApp()}><Text style={s.primaryText}>ABRIR WHATSAPP</Text></TouchableOpacity></View>
            <View style={s.contactCard}><Text style={s.contactIcon}>☎</Text><Text style={s.contactTitle}>Teléfono</Text><Text style={s.muted}>{PHONE}</Text><TouchableOpacity style={s.primary} onPress={openCall}><Text style={s.primaryText}>LLAMAR AHORA</Text></TouchableOpacity></View>
            <View style={s.contactCard}><Text style={s.contactIcon}>⌖</Text><Text style={s.contactTitle}>Valencia y alrededores</Text><TouchableOpacity style={s.secondary} onPress={()=>openMaps()}><Text style={s.secondaryText}>ABRIR MAPAS</Text></TouchableOpacity></View>
          </>}

          {tab === "cuenta" && <>
            <Text style={s.pageTitle}>{authMode==="login"?"Iniciar sesión":"Crear cuenta"}</Text>
            <View style={s.formCard}>
              {authMode==="register" && <><TextInput style={s.input} placeholder="Nombre completo" value={authName} onChangeText={setAuthName}/><TextInput style={s.input} placeholder="Teléfono" value={authPhone} onChangeText={setAuthPhone} keyboardType="phone-pad"/></>}
              <TextInput style={s.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail}/>
              <TextInput style={s.input} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword}/>
              <TouchableOpacity style={s.primary} onPress={signInOrRegister}><Text style={s.primaryText}>{authMode==="login"?"ENTRAR":"CREAR CUENTA"}</Text></TouchableOpacity>
              <TouchableOpacity style={s.secondary} onPress={()=>setAuthMode(authMode==="login"?"register":"login")}><Text style={s.secondaryText}>{authMode==="login"?"NO TENGO CUENTA":"YA TENGO CUENTA"}</Text></TouchableOpacity>
              {session && <TouchableOpacity style={s.secondary} onPress={()=>supabase.auth.signOut()}><Text style={s.secondaryText}>CERRAR SESIÓN</Text></TouchableOpacity>}
              <TouchableOpacity style={s.textButton} onPress={consent.reopen}><Text style={s.link}>Privacidad y almacenamiento local</Text></TouchableOpacity>
            </View>
          </>}

          {tab === "personal" && <>
            <Text style={s.pageTitle}>Panel del personal</Text>
            {role!=="staff" && role!=="admin" ? <View style={s.infoBox}><Text style={s.muted}>Esta zona es solo para trabajadores autorizados.</Text></View> : staffBookings.length===0 ? <View style={s.infoBox}><Text style={s.muted}>No hay servicios activos pendientes.</Text></View> : staffBookings.map(b=><View style={s.bookingCard} key={b.id}>
              <Text style={s.bookingCode}>{b.services?.name || "Servicio"}</Text><Text style={s.bookingLine}>Cliente: {b.customer_name}</Text><Text style={s.bookingLine}>Teléfono: {b.customer_phone}</Text><Text style={s.bookingLine}>{new Date(b.scheduled_at).toLocaleString()}</Text><Text style={s.bookingLine}>{b.service_address}</Text><Text style={s.statusPill}>{statusLabel(b.status)}</Text>
              {!b.assigned_staff_id && <TouchableOpacity style={s.primary} onPress={()=>claimBooking(b.id)}><Text style={s.primaryText}>ACEPTAR SERVICIO</Text></TouchableOpacity>}
              {b.assigned_staff_id===session?.user?.id && b.status!=="completed" && <TouchableOpacity style={s.primary} onPress={()=>advanceBooking(b)}><Text style={s.primaryText}>{b.status==="confirmed"?"MARCAR: EN CAMINO":b.status==="on_the_way"?"MARCAR: TRABAJO EN CURSO":"MARCAR: FINALIZADO"}</Text></TouchableOpacity>}
              <TouchableOpacity style={s.secondary} onPress={()=>Linking.openURL(`tel:${b.customer_phone}`)}><Text style={s.secondaryText}>LLAMAR AL CLIENTE</Text></TouchableOpacity><TouchableOpacity style={s.secondary} onPress={()=>openMaps(b.service_address)}><Text style={s.secondaryText}>ABRIR GPS</Text></TouchableOpacity>
            </View>)}
          </>}

          {tab === "admin" && <>
            <Text style={s.pageTitle}>Administración</Text>
            {role!=="admin" ? <View style={s.infoBox}><Text style={s.muted}>Esta zona es solo para administradores.</Text></View> : <>
              <View style={s.adminIntro}><Text style={s.adminIntroTitle}>Control completo</Text><Text style={s.muted}>Desde aquí puedes corregir precios y descripciones, mostrar u ocultar servicios, gestionar planes, reservas, pagos y personal.</Text></View>

              <Text style={s.subsection}>Servicios y precios</Text>
              {adminServices.map(x=>{
                const v=visualFor(x.name);
                return <View key={x.id} style={s.adminServiceCard}>
                  <Image source={{uri:v.image}} style={s.adminImage}/>
                  <View style={{padding:14}}>
                    <View style={s.adminTopRow}><View style={{flex:1}}><Text style={s.adminTitle}>{x.name}</Text><Text style={s.adminMuted}>{x.active?"Visible para clientes":"Oculto"}</Text></View><TouchableOpacity style={[s.visibilityButton,!x.active&&{backgroundColor:"#73859A"}]} onPress={()=>toggleService(x)}><Text style={s.visibilityText}>{x.active?"OCULTAR":"MOSTRAR"}</Text></TouchableOpacity></View>
                    <Text style={s.label}>Precio desde (€)</Text>
                    <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Precio" value={servicePriceDrafts[x.id]??""} onChangeText={v=>setServicePriceDrafts(p=>({...p,[x.id]:v}))}/>
                    <Text style={s.label}>Descripción</Text>
                    <TextInput style={[s.input,{height:76,textAlignVertical:"top"}]} multiline placeholder="Descripción del servicio" value={serviceDescriptionDrafts[x.id]??""} onChangeText={v=>setServiceDescriptionDrafts(p=>({...p,[x.id]:v}))}/>
                    <TouchableOpacity style={s.primary} onPress={()=>saveService(x)}><Text style={s.primaryText}>GUARDAR CAMBIOS</Text></TouchableOpacity>
                  </View>
                </View>
              })}

              <Text style={s.subsection}>Planes de mantenimiento</Text>
              {adminPlans.map(x=><View key={x.id} style={s.adminRow}><View style={{flex:1}}><Text style={s.adminTitle}>{x.name}</Text><Text style={s.adminMuted}>{x.description}</Text><TextInput style={s.input} keyboardType="decimal-pad" placeholder="Precio por visita €" value={planPriceDrafts[x.id]??""} onChangeText={v=>setPlanPriceDrafts(p=>({...p,[x.id]:v}))}/><TouchableOpacity style={s.primary} onPress={()=>savePlan(x)}><Text style={s.primaryText}>GUARDAR PRECIO DEL PLAN</Text></TouchableOpacity></View></View>)}

              <Text style={s.subsection}>Reservas</Text>
              {adminBookings.length===0 ? <View style={s.infoBox}><Text style={s.muted}>No hay reservas todavía.</Text></View> : adminBookings.map(b=><View style={s.bookingCard} key={b.id}>
                <Text style={s.bookingCode}>{b.services?.name || "Servicio"}</Text><Text style={s.bookingLine}>Cliente: {b.customer_name}</Text><Text style={s.bookingLine}>Teléfono: {b.customer_phone}</Text><Text style={s.bookingLine}>{new Date(b.scheduled_at).toLocaleString()}</Text><Text style={s.bookingLine}>{b.service_address}</Text><Text style={s.statusPill}>{statusLabel(b.status)}</Text><Text style={s.bookingLine}>Pago: {b.payment_status}</Text>
                {b.payment_status!=="paid" && <TouchableOpacity style={s.primary} onPress={()=>markPaid(b.id)}><Text style={s.primaryText}>MARCAR COMO PAGADO</Text></TouchableOpacity>}
                <Text style={[s.label,{marginTop:14}]}>Asignar trabajador</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}><TouchableOpacity style={s.chip} onPress={()=>assignStaff(b.id,null)}><Text style={s.chipText}>Sin asignar</Text></TouchableOpacity>{staffList.filter(x=>x.role==="staff").map(st=><TouchableOpacity key={st.id} style={[s.chip,b.assigned_staff_id===st.id&&s.chipOn]} onPress={()=>assignStaff(b.id,st.id)}><Text style={[s.chipText,b.assigned_staff_id===st.id&&{color:"white"}]}>{st.full_name || "Trabajador"}</Text></TouchableOpacity>)}</ScrollView>
                <Text style={[s.label,{marginTop:14}]}>Cambiar estado</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{["received","confirmed","on_the_way","in_progress","completed","cancelled"].map(st=><TouchableOpacity key={st} style={[s.chip,b.status===st&&s.chipOn]} onPress={()=>adminSetStatus(b.id,st)}><Text style={[s.chipText,b.status===st&&{color:"white"}]}>{statusLabel(st)}</Text></TouchableOpacity>)}</ScrollView>
              </View>)}

              <Text style={s.subsection}>Equipo</Text>
              {staffList.filter(st=>st.role==="staff").map(st=><View key={st.id} style={s.adminRow}><View style={{flex:1}}><Text style={s.adminTitle}>{st.full_name || "Sin nombre"}</Text><Text style={s.adminMuted}>{st.phone || "Sin teléfono"}</Text></View><TouchableOpacity style={s.smallButton} onPress={()=>changeUserRole(st.id,"client")}><Text style={s.smallButtonText}>QUITAR</Text></TouchableOpacity></View>)}
              <Text style={s.subsection}>Añadir personal</Text>
              {clientList.length===0 ? <View style={s.infoBox}><Text style={s.muted}>No hay clientes disponibles para añadir.</Text></View> : clientList.map(cl=><View key={cl.id} style={s.adminRow}><View style={{flex:1}}><Text style={s.adminTitle}>{cl.full_name || "Sin nombre"}</Text><Text style={s.adminMuted}>{cl.phone || "Sin teléfono"}</Text></View><TouchableOpacity style={s.smallButton} onPress={()=>changeUserRole(cl.id,"staff")}><Text style={s.smallButtonText}>AÑADIR</Text></TouchableOpacity></View>)}
            </>}
          </>}
        </ScrollView>

        <View style={s.nav}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.navInner}>
            {navItems.map(([k,i,l])=><TouchableOpacity key={k} style={[s.navItem,tab===k&&s.navItemOn]} onPress={()=>setTab(k as Tab)}><Text style={[s.navIcon,tab===k&&s.navTextOn]}>{i}</Text><Text numberOfLines={1} style={[s.navText,tab===k&&s.navTextOn]}>{l}</Text></TouchableOpacity>)}
          </ScrollView>
        </View>
      </SafeAreaView>
    </>
  );
}

function MiniBenefit({icon,label}:{icon:string;label:string}) {
  return <View style={s.miniBenefit}><Text style={s.miniIcon}>{icon}</Text><Text style={s.miniLabel}>{label}</Text></View>;
}
function TrustItem({icon,title,subtitle}:{icon:string;title:string;subtitle:string}) {
  return <View style={s.trustItem}><Text style={s.trustIcon}>{icon}</Text><Text style={s.trustTitle}>{title}</Text><Text style={s.trustSub}>{subtitle}</Text></View>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#FFFFFF"},
  header:{backgroundColor:BLUE2,paddingHorizontal:18,paddingVertical:14,flexDirection:"row",alignItems:"center",gap:14,borderBottomWidth:1,borderBottomColor:"#D7E8F5"},
  logo:{width:70,height:70,borderRadius:35,backgroundColor:"white"},brand:{fontSize:26,fontWeight:"900",color:"white"},tag:{fontSize:13,color:"#EAF5FF",marginTop:2},
  content:{paddingBottom:118},
  heroImage:{minHeight:330,justifyContent:"stretch",backgroundColor:"#E8F4FE"},heroImageInner:{resizeMode:"cover"},heroShade:{flex:1,backgroundColor:"rgba(255,255,255,0.72)",padding:24,justifyContent:"center"},
  heroTitle:{fontSize:34,fontWeight:"900",color:BLUE,lineHeight:39,maxWidth:540},heroSub:{fontSize:18,color:"#234E75",marginTop:10,marginBottom:22},benefitsRow:{flexDirection:"row",justifyContent:"space-between",gap:8,maxWidth:680},
  miniBenefit:{flex:1,alignItems:"center"},miniIcon:{fontSize:28,fontWeight:"900",color:BLUE2},miniLabel:{fontSize:12,fontWeight:"800",color:BLUE,textAlign:"center",lineHeight:16,marginTop:5},
  bookingBanner:{margin:16,marginBottom:10,backgroundColor:BLUE2,borderRadius:22,padding:20,flexDirection:"row",alignItems:"center"},bannerTitle:{fontSize:22,fontWeight:"900",color:"white"},bannerText:{fontSize:14,color:"#EAF5FF",lineHeight:20,marginTop:6},
  whiteButton:{backgroundColor:"white",borderRadius:18,paddingVertical:15,paddingHorizontal:18,alignItems:"center",justifyContent:"center",minWidth:145},whiteButtonText:{color:BLUE2,fontWeight:"900",fontSize:13},
  sectionRow:{paddingHorizontal:16,paddingTop:10,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},section:{fontSize:28,fontWeight:"900",color:BLUE},link:{fontSize:15,fontWeight:"800",color:BLUE2},
  grid:{flexDirection:"row",flexWrap:"wrap",padding:10,gap:10},serviceCard:{width:"48%",backgroundColor:"white",borderRadius:18,borderWidth:1,borderColor:"#D8E6F1",overflow:"hidden",shadowColor:"#789",shadowOpacity:0.10,shadowRadius:8,elevation:2},
  serviceImage:{width:"100%",height:118,backgroundColor:"#EAF4FC"},serviceBody:{padding:12,minHeight:205},iconSquare:{width:42,height:42,borderRadius:12,backgroundColor:"#EAF5FF",alignItems:"center",justifyContent:"center",marginBottom:8},iconText:{fontSize:23,color:BLUE2,fontWeight:"900"},
  serviceName:{fontSize:17,fontWeight:"900",color:BLUE,lineHeight:21},serviceDescription:{fontSize:13,color:"#536E84",lineHeight:18,marginTop:6,minHeight:54},price:{fontSize:17,fontWeight:"900",color:BLUE,marginTop:6},reserveMini:{backgroundColor:"#DDF1FF",borderRadius:10,paddingVertical:9,alignItems:"center",marginTop:8},reserveMiniText:{fontWeight:"900",color:BLUE2},
  trustPanel:{margin:16,backgroundColor:"#EAF6FF",borderRadius:20,paddingVertical:18,paddingHorizontal:8,flexDirection:"row",justifyContent:"space-between",gap:4},trustItem:{flex:1,alignItems:"center"},trustIcon:{fontSize:23,color:BLUE2,fontWeight:"900"},trustTitle:{fontSize:11,fontWeight:"900",color:BLUE,textAlign:"center",marginTop:6},trustSub:{fontSize:10,color:"#4E86B6",textAlign:"center",marginTop:3},
  contactBanner:{marginHorizontal:16,marginBottom:18,backgroundColor:BLUE2,borderRadius:20,padding:20,flexDirection:"row",alignItems:"center",gap:12},
  pageTitle:{fontSize:30,fontWeight:"900",color:BLUE,marginHorizontal:18,marginTop:22},pageIntro:{fontSize:15,color:"#587187",marginHorizontal:18,marginTop:4,marginBottom:18},
  label:{fontSize:13,fontWeight:"900",color:BLUE,marginTop:12,marginBottom:6},selectCard:{marginHorizontal:18,marginBottom:10,borderRadius:16,borderWidth:1,borderColor:"#D8E6F1",backgroundColor:"white",padding:10,flexDirection:"row",alignItems:"center",gap:12},selectCardOn:{backgroundColor:BLUE2,borderColor:BLUE2},selectThumb:{width:80,height:62,borderRadius:10},selectTitle:{fontSize:16,fontWeight:"900",color:BLUE},selectPrice:{fontSize:13,fontWeight:"800",color:BLUE2,marginTop:4},
  option:{marginHorizontal:18,padding:14,borderRadius:12,backgroundColor:"white",borderWidth:1,borderColor:"#D8E6F1",marginBottom:8},optionActive:{backgroundColor:BLUE2,borderColor:BLUE2},optionText:{color:"#385A74"},optionTextActive:{color:"white",fontWeight:"900"},
  input:{backgroundColor:"white",borderWidth:1,borderColor:"#D4E2ED",borderRadius:12,padding:13,marginTop:8,color:"#173B5A"},primary:{backgroundColor:BLUE2,padding:15,borderRadius:12,alignItems:"center",marginTop:12},primaryText:{color:"white",fontWeight:"900"},
  secondary:{borderWidth:1.5,borderColor:BLUE2,padding:13,borderRadius:12,alignItems:"center",marginTop:10},secondaryText:{color:BLUE2,fontWeight:"900"},whatsapp:{backgroundColor:"#169447",padding:15,borderRadius:12,alignItems:"center",marginTop:12},textButton:{padding:14,alignItems:"center"},
  infoBox:{margin:18,backgroundColor:LIGHT,borderRadius:16,padding:18,borderWidth:1,borderColor:"#DCEAF4"},muted:{color:"#60798E",lineHeight:20},bookingCard:{marginHorizontal:18,marginTop:14,backgroundColor:"white",padding:16,borderRadius:16,borderWidth:1,borderColor:"#D8E6F1"},bookingCode:{fontSize:20,fontWeight:"900",color:BLUE},bookingLine:{color:"#4C687E",marginTop:6},statusPill:{alignSelf:"flex-start",backgroundColor:"#E0F2FF",color:BLUE2,fontWeight:"900",paddingHorizontal:10,paddingVertical:6,borderRadius:12,marginTop:10,overflow:"hidden"},
  planCard:{marginHorizontal:18,marginTop:14,backgroundColor:"white",padding:20,borderRadius:20,borderWidth:1,borderColor:"#D4E3EE"},planTag:{fontSize:12,fontWeight:"900",color:BLUE2},planName:{fontSize:27,fontWeight:"900",color:BLUE,marginTop:6},planDesc:{fontSize:16,color:"#60798E",lineHeight:23,marginTop:8},planPrice:{fontSize:20,fontWeight:"900",color:BLUE2,marginTop:10},
  contactCard:{marginHorizontal:18,marginTop:14,backgroundColor:LIGHT,padding:20,borderRadius:18,borderWidth:1,borderColor:"#D7E8F5"},contactIcon:{fontSize:30,color:BLUE2},contactTitle:{fontSize:22,fontWeight:"900",color:BLUE,marginTop:4},formCard:{margin:18,backgroundColor:LIGHT,padding:18,borderRadius:18,borderWidth:1,borderColor:"#D7E8F5"},
  adminIntro:{margin:18,backgroundColor:"#EAF6FF",borderRadius:18,padding:18},adminIntroTitle:{fontSize:21,fontWeight:"900",color:BLUE},subsection:{fontSize:22,fontWeight:"900",color:BLUE,marginHorizontal:18,marginTop:22,marginBottom:8},adminServiceCard:{marginHorizontal:18,marginBottom:14,borderWidth:1,borderColor:"#D6E5F0",borderRadius:18,overflow:"hidden",backgroundColor:"white"},adminImage:{width:"100%",height:150},adminTopRow:{flexDirection:"row",alignItems:"center",gap:10},adminTitle:{fontSize:17,fontWeight:"900",color:BLUE},adminMuted:{fontSize:12,color:"#657D91",marginTop:3},visibilityButton:{backgroundColor:BLUE2,paddingVertical:8,paddingHorizontal:10,borderRadius:10},visibilityText:{color:"white",fontWeight:"900",fontSize:11},adminRow:{marginHorizontal:18,marginBottom:10,backgroundColor:"white",borderRadius:14,borderWidth:1,borderColor:"#D9E7F1",padding:14,flexDirection:"row",alignItems:"center",gap:12},smallButton:{backgroundColor:BLUE2,paddingVertical:10,paddingHorizontal:12,borderRadius:9},smallButtonText:{color:"white",fontWeight:"900"},chip:{paddingVertical:9,paddingHorizontal:12,borderRadius:18,borderWidth:1,borderColor:"#C9D9E5",marginRight:8,backgroundColor:"white"},chipOn:{backgroundColor:BLUE2,borderColor:BLUE2},chipText:{color:"#3B5E78",fontSize:12},
  nav:{position:"absolute",left:0,right:0,bottom:0,backgroundColor:BLUE,borderTopLeftRadius:28,borderTopRightRadius:28,paddingTop:8,paddingBottom:Platform.OS==="web"?12:10,shadowColor:"#001",shadowOpacity:.16,shadowRadius:9,elevation:10},navInner:{paddingHorizontal:8,gap:2},navItem:{width:92,minHeight:70,borderRadius:18,alignItems:"center",justifyContent:"center",paddingHorizontal:4},navItemOn:{backgroundColor:"white"},navIcon:{fontSize:22,color:"#B9D5EA",fontWeight:"900"},navText:{fontSize:11,color:"#E4F1FA",fontWeight:"800",marginTop:4},navTextOn:{color:BLUE2}
});
