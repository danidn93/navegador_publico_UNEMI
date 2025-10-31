// src/lib/pushClient.ts
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string; // ponla en .env

// helper: base64url -> Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export async function ensurePushPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  const current = Notification.permission;
  if (current === "granted") return true;
  const req = await Notification.requestPermission();
  return req === "granted";
}

export async function subscribePush(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const ok = await ensurePushPermission();
    if (!ok) return false;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    let sub = existing;
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const { data: auth } = await supabase.auth.getUser();
    const email = auth?.user?.email?.toLowerCase?.() ?? null;

    // Guarda/actualiza en tabla
    const endpoint = sub.endpoint;
    const p256dh = btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!)));
    const authK  = btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!)));

    // Upsert vía RPC o PostgREST:
    const { error } = await (supabase as any)
      .from("web_push_subscriptions")
      .upsert(
        { endpoint, p256dh, auth: authK, user_email: email },
        { onConflict: "endpoint" }
      );
    if (error) {
      console.error(error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("subscribePush error", e);
    return false;
  }
}

// Disparar una notificación local vía SW (útil cuando detectas novedades en vivo)
export async function showLocalNotification(title: string, body: string, url?: string, tag?: string) {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  // envia mensaje al SW para que la cree (así se pinta en la barra)
  reg.active?.postMessage({
    type: "SHOW_LOCAL_NOTIFICATION",
    title, body, url, tag
  });
}

// Llamar a la Edge Function para *push real* (funciona con app cerrada)
export async function sendServerPush(payload: {title: string; body: string; url?: string; tag?: string; targetEmail?: string}) {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token ?? "";
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-web-push`;
  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type":"application/json",
      "Authorization": `Bearer ${jwt}`,
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}
