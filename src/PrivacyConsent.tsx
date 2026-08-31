import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CONSENT_KEY = "isoana_privacy_consent_v1";

type ConsentValue = {
  accepted: boolean;
  onlyNecessary: boolean;
  date: string;
};

/**
 * Modal de consentimiento de privacidad y "cookies"/almacenamiento local,
 * conforme a RGPD (UE 2016/679), LOPDGDD (3/2018) y LSSI-CE (art. 22.2)
 * para apps que usan almacenamiento local (AsyncStorage) para mantener
 * la sesión del usuario.
 *
 * Se muestra una única vez (hasta que el usuario decide) y guarda su
 * elección en AsyncStorage. Expón `reopen()` desde fuera (p. ej. un botón
 * "Privacidad" en el tab Cuenta) para que el usuario pueda revisar/cambiar
 * su decisión en cualquier momento.
 */
export function usePrivacyConsent() {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CONSENT_KEY).then((raw) => {
      if (!raw) setVisible(true);
      setChecked(true);
    });
  }, []);

  async function saveConsent(onlyNecessary: boolean) {
    const value: ConsentValue = {
      accepted: true,
      onlyNecessary,
      date: new Date().toISOString()
    };
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(value));
    setVisible(false);
  }

  function reopen() {
    setVisible(true);
  }

  return { visible, checked, saveConsent, reopen };
}

export default function PrivacyConsentModal({
  visible,
  onAcceptAll,
  onlyNecessary
}: {
  visible: boolean;
  onAcceptAll: () => void;
  onlyNecessary: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={st.overlay}>
        <View style={st.card}>
          <Text style={st.title}>Privacidad y almacenamiento local</Text>
          <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={st.p}>
              Limpiezas Isoana es la responsable del tratamiento de tus datos
              personales, de acuerdo con el Reglamento (UE) 2016/679 (RGPD) y
              la Ley Orgánica 3/2018 de Protección de Datos y garantía de los
              derechos digitales (LOPDGDD).
            </Text>
            <Text style={st.h}>¿Qué datos usamos y para qué?</Text>
            <Text style={st.p}>
              Nombre, teléfono, correo electrónico, dirección del servicio y
              los datos de tus reservas, para gestionar tu cuenta, tramitar
              tus reservas y contactar contigo sobre el servicio contratado.
            </Text>
            <Text style={st.h}>Almacenamiento local ("cookies" de la app)</Text>
            <Text style={st.p}>
              Esta app no funciona en un navegador, por lo que no usa cookies
              web, pero sí utiliza tecnologías de almacenamiento local
              equivalentes (AsyncStorage) en tu dispositivo para mantener tu
              sesión iniciada y que no tengas que volver a identificarte cada
              vez. En aplicación del art. 22.2 de la LSSI-CE, te informamos
              de ello y te pedimos tu consentimiento.
            </Text>
            <Text style={st.p}>
              • Necesarias: mantener tu sesión iniciada (siempre activas,
              imprescindibles para el funcionamiento de la app).{"\n"}
              • Nada de analítica ni publicidad de terceros: esta app no
              instala cookies ni tecnologías de seguimiento con fines
              publicitarios o estadísticos de terceros.
            </Text>
            <Text style={st.h}>Tus derechos</Text>
            <Text style={st.p}>
              Puedes ejercer tus derechos de acceso, rectificación,
              supresión, limitación, oposición y portabilidad escribiéndonos
              al teléfono 642148996 (WhatsApp) o desde el apartado Cuenta de
              la app. Tus datos se conservarán mientras mantengas tu cuenta
              activa o mientras sea necesario para prestarte el servicio.
            </Text>
            <Text style={st.p}>
              También tienes derecho a presentar una reclamación ante la
              Agencia Española de Protección de Datos (www.aepd.es) si
              consideras que el tratamiento no se ajusta a la normativa.
            </Text>
          </ScrollView>

          <TouchableOpacity style={st.primary} onPress={onAcceptAll}>
            <Text style={st.primaryText}>ACEPTAR Y CONTINUAR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.secondary} onPress={onlyNecessary}>
            <Text style={st.secondaryText}>SOLO LO NECESARIO PARA FUNCIONAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,46,89,0.72)",
    justifyContent: "center",
    padding: 20
  },
  card: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 20,
    maxHeight: "85%"
  },
  title: { fontSize: 19, fontWeight: "900", color: "#0B2E59", marginBottom: 10 },
  body: { marginBottom: 10 },
  h: { fontSize: 14, fontWeight: "800", color: "#0B2E59", marginTop: 10, marginBottom: 4 },
  p: { fontSize: 13, color: "#38506B", lineHeight: 19 },
  primary: {
    backgroundColor: "#2AA7A1",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8
  },
  primaryText: { color: "white", fontWeight: "900" },
  secondary: {
    borderWidth: 1,
    borderColor: "#0B2E59",
    padding: 13,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10
  },
  secondaryText: { color: "#0B2E59", fontWeight: "800" }
});
