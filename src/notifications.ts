import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// Cómo se muestran las notificaciones mientras la app está abierta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

/**
 * Pide permiso de notificaciones, obtiene el push token de Expo y lo
 * guarda en profiles.push_token para ese usuario. Solo tiene sentido
 * llamarlo para cuentas de personal/admin, que son quienes deben
 * enterarse de las nuevas reservas.
 */
export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) {
    // Los simuladores/emuladores no reciben push notifications.
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
