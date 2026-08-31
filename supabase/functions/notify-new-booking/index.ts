// supabase/functions/notify-new-booking/index.ts
//
// Se despliega con: supabase functions deploy notify-new-booking
// Se dispara mediante un Database Webhook de Supabase (evento INSERT en
// la tabla "bookings") que llama a esta función automáticamente.
//
// Busca los push tokens de todo el personal y administradores
// (profiles.role in ('staff','admin')) y les envía una notificación
// push a través del servicio gratuito de Expo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Supabase Database Webhooks envían { type, table, record, ... }
    const booking = payload.record;
    if (!booking) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: staff, error } = await supabase
      .from("profiles")
      .select("push_token")
      .in("role", ["staff", "admin"])
      .not("push_token", "is", null);

    if (error) throw error;

    const tokens = (staff || [])
      .map((p: any) => p.push_token)
      .filter((t: string | null) => !!t);

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const messages = tokens.map((token: string) => ({
      to: token,
      sound: "default",
      title: "Nueva reserva",
      body: `${booking.customer_name || "Un cliente"} ha reservado un servicio.`,
      data: { bookingId: booking.id }
    }));

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(messages)
    });

    const result = await res.json();

    return new Response(JSON.stringify({ sent: tokens.length, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
