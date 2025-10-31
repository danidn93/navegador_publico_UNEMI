// src/pages/verify.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, MailCheck, ArrowLeft, Home, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** Extrae tokens desde #hash y ?query (soporta ambos formatos de Supabase) */
function getAuthTokens() {
  const tokens: { access_token?: string; refresh_token?: string } = {};

  // #access_token=...&refresh_token=...
  const h = window.location.hash?.startsWith("#")
    ? new URLSearchParams(window.location.hash.slice(1))
    : new URLSearchParams("");
  tokens.access_token = h.get("access_token") ?? undefined;
  tokens.refresh_token = h.get("refresh_token") ?? undefined;

  // ?access_token=...&refresh_token=... (por si llega así)
  const q = new URLSearchParams(window.location.search);
  if (!tokens.access_token && q.get("access_token")) tokens.access_token = q.get("access_token") ?? undefined;
  if (!tokens.refresh_token && q.get("refresh_token")) tokens.refresh_token = q.get("refresh_token") ?? undefined;

  return tokens;
}

export default function VerifyPage() {
  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");
  const [msg, setMsg] = useState<string>("Validando tu enlace…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        // 1) Si el enlace trae tokens, crea la sesión
        const { access_token, refresh_token } = getAuthTokens();
        if (access_token && refresh_token) {
          const { error: sessErr } = await supabase.auth.setSession({ access_token, refresh_token });
          if (sessErr) throw sessErr;
        }

        // 2) Verifica que hay usuario autenticado (puede no haber si ya se validó antes)
        const { data: ures, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;

        // 3) Llama a tu RPC para crear/asegurar el perfil student
        //    (La función debe ser SECURITY DEFINER y hacer ON CONFLICT DO NOTHING)
        if (ures?.user) {
          const { error: rpcErr } = await supabase.rpc("create_student_profile");
          if (rpcErr) {
            // No bloquea la verificación; solo avisamos
            console.error("[verify] RPC error:", rpcErr);
            toast.error("Tu correo fue verificado, pero no se pudo crear el perfil. Intenta iniciar sesión.");
          }
          setStatus("ok");
          setMsg("¡Correo verificado! Tu cuenta de estudiante quedó activa.");
        } else {
          // Caso: no hay sesión, pero el enlace fue válido (p. ej., ya estabas logueado en otro navegador)
          setStatus("ok");
          setMsg("Verificación completada. Ya puedes iniciar sesión.");
        }
      } catch (e: any) {
        console.error("[verify] error:", e);
        setStatus("error");
        setMsg(e?.message ?? "No se pudo verificar el enlace.");
        toast.error(e?.message ?? "No se pudo verificar el enlace.");
      }
    })();
  }, []);

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: `url('/bg-admin.png')` }}
    >
      <div className="absolute inset-0 bg-black/50" />

      <header className="relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3 text-white/90">
          <Link to="/" className="h-9 w-9 rounded-lg bg-white/15 grid place-items-center ring-1 ring-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="mr-auto">
            <h1 className="text-lg font-semibold leading-tight">UNEMI Campus · Verificación</h1>
            <p className="text-xs text-white/75">Activación de cuenta de estudiante</p>
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-[calc(100vh-64px)]">
        <div className="max-w-7xl mx-auto h-full px-4 md:px-6">
          <div className="flex h-[calc(100vh-64px)] items-center">
            <div className="hidden md:block md:basis-1/2 lg:basis-2/3" />
            <div className="w-full md:basis-1/2 lg:basis-1/3">
              <Card className="backdrop-blur-xl bg-white/10 border-white/20 text-white shadow-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MailCheck className="w-5 h-5" />
                    Verificación de correo
                  </CardTitle>
                  <CardDescription className="text-white/80">
                    Procesando tu enlace de confirmación…
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-3 text-white/90">
                    {status === "checking" && (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin text-white/80" />
                        <span>{msg}</span>
                      </>
                    )}
                    {status === "ok" && (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-green-300" />
                        <span>{msg}</span>
                      </>
                    )}
                    {status === "error" && (
                      <>
                        <XCircle className="w-5 h-5 text-red-300" />
                        <span>{msg}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button asChild variant="outline" className="bg-white text-slate-900 hover:bg-white/90">
                      <Link to="/">
                        <Home className="w-4 h-4 mr-2" /> Inicio
                      </Link>
                    </Button>
                    <Button asChild className="bg-white text-slate-900 hover:bg-white/90">
                      <Link to="/login">Ir a iniciar sesión</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
