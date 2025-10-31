// supabase/functions/send-web-push/index.ts
// Deno + ESM para web-push
import webpush from "https://esm.sh/web-push@3.6.7";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  // filtros simples
  targetEmail?: string; // si quieres notificar a un usuario
}

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:mapaunemi@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY") || "BGDC3SN4UrXYkmSpjcc0solx7T97gTYdqd4c13yMqz3hdZxWvhkX18ubZOb5RSmeIiJTzbMejViW5VmqpV7CVD4",
  Deno.env.get("VAPID_PRIVATE_KEY") || "UnC224Rk4qItrLFGoqvvriM3TyobtBgPtoSgjctrrRY"
);

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_email: string | null;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { title, body, url = "/", tag = "unemi-general", targetEmail } = await req.json() as PushPayload;
    if (!title || !body) {
      return new Response(JSON.stringify({ error: "title/body requeridos" }), { status: 400, headers: cors });
    }

    // Lee subs desde PostgREST (usa service role en Function context)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const filter = targetEmail ? `?user_email=eq.${encodeURIComponent(targetEmail)}` : "";
    const res = await fetch(`${supabaseUrl}/rest/v1/web_push_subscriptions${filter}`, {
      headers: {
        apiKey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
    });
    const subs: SubscriptionRow[] = await res.json();

    const data = { title, body, url, tag };
    const payload = JSON.stringify(data);

    let sent = 0, failed = 0;
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            } as any,
            payload
          );
          sent++;
        } catch (e) {
          failed++;
          // Si endpoint inválido, podrías borrar la sub
          if (e?.statusCode === 410 || e?.statusCode === 404) {
            await fetch(`${supabaseUrl}/rest/v1/web_push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
              method: "DELETE",
              headers: {
                apiKey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
              },
            });
          }
        }
      })
    );

    return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: { "Content-Type":"application/json", ...cors } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), { status: 500, headers: cors });
  }
});
