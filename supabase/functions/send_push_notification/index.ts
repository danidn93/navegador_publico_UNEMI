// supabase/functions/send-push-notification/index.ts

// Asegúrate de usar un import compatible con Deno/ESM para web-push
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "https://esm.sh/web-push@3.6.7";

// --- Configuración VAPID ---
// La clave pública se comparte en el cliente, la privada es secreta.
const VAPID_PUBLIC_KEY = "BGDC3SN4UrXYkmSpjcc0solx7T97gTYdqd4c13yMqz3hdZxWvhkX18ubZOb5RSmeIiJTzbMejViW5VmqpV7CVD4";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// Establece los detalles VAPID. El email es solo un contacto para el servicio push.
webPush.setVapidDetails(
  "mailto:admin@unemi.edu.ec", 
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Define el tipo de la suscripción (estructura esperada por web-push)
interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const newNotification = payload.record; // Fila insertada en 'notifications'
    
    if (!newNotification) {
        return new Response("Payload missing 'record'.", { status: 400 });
    }

    // Cliente de Supabase con Service Role Key (para saltar RLS y consultar de forma segura)
    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const targetUserId = newNotification.user_target; // BIGINT (app_users.id)
    const targetRole = newNotification.role_target; // TEXT (e.g., 'student', 'admin')
    let targetEmails: string[] = [];
    let subscriptions: PushSubscription[] = [];

    // --- 1. IDENTIFICAR LOS EMAILS DE DESTINO (Basado en app_users.usuario) ---
    if (targetUserId) {
        // Opción A: Buscar el email/usuario por ID (user_target)
        const { data, error } = await supabaseAdmin
            .from("app_users")
            .select("usuario") // 'usuario' es el campo TEXT que contiene el email/username
            .eq("id", targetUserId)
            .single();

        if (data) targetEmails = [data.usuario];
        if (error) console.error("Error buscando usuario por ID:", error);

    } else if (targetRole && targetRole !== 'logged_in') { 
        // Opción B: Buscar todos los emails/usuarios que pertenecen a ese rol
        const { data, error } = await supabaseAdmin
            .from("app_users")
            .select("usuario")
            .eq("role", targetRole);

        if (data) targetEmails = data.map(d => d.usuario);
        if (error) console.error("Error buscando usuarios por rol:", error);
    }
    
    // --- 2. BUSCAR SUSCRIPCIONES PUSH USANDO LOS EMAILS ---
    if (targetEmails.length > 0) {
        const { data: subsData, error: subsError } = await supabaseAdmin
            .from("web_push_subscriptions")
            .select("endpoint, p256dh, auth")
            // Buscar en la columna 'user_email' de la tabla de suscripciones
            .in("user_email", targetEmails); 

        if (subsData) {
            subscriptions = subsData.map((d: any) => ({
                endpoint: d.endpoint,
                keys: { p256dh: d.p256dh, auth: d.auth }, // Mapeo al formato de web-push
            })) as PushSubscription[];
        }
        if (subsError) console.error("Error buscando suscripciones:", subsError);
    }
    
    if (subscriptions.length === 0) {
        return new Response(JSON.stringify({ ok: true, message: "No subscribers found" }), { status: 200 });
    }

    // --- 3. PREPARAR PAYLOAD Y ENVIAR ---
    const pushPayload = JSON.stringify({
      title: newNotification.details?.title || "UNEMI Campus",
      body: newNotification.reason || "Tienes una nueva notificación",
      icon: "/icons/icon-192.png",
      data: {
        url: newNotification.details?.url || "/",
      },
    });

    const sendPromises = subscriptions.map((sub) =>
        webPush.sendNotification(sub, pushPayload).catch(async (err: any) => {
            // Manejo de Error 410 (Suscripción expirada/dispositivo eliminado)
            if (err.statusCode === 410) { 
                await supabaseAdmin
                    .from("web_push_subscriptions")
                    .delete()
                    .eq("endpoint", sub.endpoint);
                console.warn(`Suscripción ${sub.endpoint} eliminada (410).`);
            } else {
                console.error("Error al enviar Push:", err.message);
            }
        })
    );
    
    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ ok: true, count: subscriptions.length }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err) {
    console.error("Fallo crítico en Edge Function:", err);
    return new Response(String(err instanceof Error ? err.message : 'Unknown error'), { status: 500 });
  }
});