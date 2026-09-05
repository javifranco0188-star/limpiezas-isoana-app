import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// Las notificaciones push de Expo son para la app nativa.
// En web/PWA evitamos inicializarlas para no provocar errores en el navegador.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    })
  });
}

/**
 * Pide permiso de notificaciones, obtiene el push token de Expo y lo
 * guarda en profiles.push_token para ese usuario. Solo se usa en la app
 * nativa para cuentas de personal/admin.
 */
export async function registerForPushNotifications(userId: string) {
  if (Platform.OS === "web") return null;

  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return null;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    console.warn(
      "Falta el projectId de EAS en app.json (expo.extra.eas.projectId). " +
      "Ejecuta 'eas init' para generarlo antes de poder recibir push notifications."
    );
    return null;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResponse.data;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.HIGH
    });
  }

  await supabase.from("profiles").update({ push_token: token }).eq("id", userId);

  return token;
}
