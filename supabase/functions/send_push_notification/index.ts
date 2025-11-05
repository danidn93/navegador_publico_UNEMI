// supabase/functions/send-push-notification/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "web-push";

// VAPID keys (el email es solo un 'mailto' de contacto)
const VAPID_PUBLIC_KEY = "BGDC3SN4UrXYkmSpjcc0solx7T97gTYdqd4c13yMqz3hdZxWvhkX18ubZOb5RSmeIiJTzbMejViW5VmqpV7CVD4";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
webPush.setVapidDetails(
  "mailto:admin@unemi.edu.ec", // Tu email de contacto
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Define el tipo de la suscripción
interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

Deno.serve(async (req) => {
  const payload = await req.json();
  // El 'record' es la fila que se insertó en 'notifications'
  const newNotification = payload.record;

  try {
    // 1. Crear un cliente de Supabase (con rol de 'service_key' para saltar RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("Notificación recibida:", newNotification.reason);

    // 2. Determinar a quién va
    const targetRole = newNotification.role_target; // ej: 'student'
    const targetUser = newNotification.user_target; // ej: 123
    let subscriptions: PushSubscription[] = [];

    if (targetUser) {
      // Es para un usuario específico
      const { data, error } = await supabaseAdmin
        .from("app_users")
        .select("push_subscription")
        .eq("id", targetUser) // El ID numérico
        .not("push_subscription", "is", null) // Que SÍ tenga suscripción
        .single();
      if (data) subscriptions = [data.push_subscription];
      if (error) console.error("Error buscando usuario específico:", error);
    } else {
      // Es para un rol (admin, student, public)
      const { data, error } = await supabaseAdmin
        .from("app_users")
        .select("push_subscription")
        .eq("role", targetRole) // ¡Asume que 'app_users' tiene una columna 'role'!
        .not("push_subscription", "is", null);
      if (data) subscriptions = data.map((d: any) => d.push_subscription);
      if (error) console.error("Error buscando por rol:", error);
    }

    console.log(`Enviando a ${subscriptions.length} suscriptores...`);

    // 3. Preparar el payload de la notificación
    const pushPayload = JSON.stringify({
      title: "UNEMI Campus",
      body: newNotification.reason || "Tienes una nueva notificación",
      icon: "/icons/icon-192.png",
      data: {
        url: newNotification.details?.url || "/", // URL a abrir
      },
    });

    // 4. Enviar todas las notificaciones
    const sendPromises = subscriptions.map((sub) =>
      webPush.sendNotification(sub, pushPayload).catch((err) => {
        // Si una suscripción falla (ej. el usuario desinstaló la app),
        // deberíamos borrarla de la BD, pero por ahora solo logueamos.
        console.error("Error enviando push:", err.body);
      })
    );
    
    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(String(err?.message ?? err), { status: 500 });
  }
});