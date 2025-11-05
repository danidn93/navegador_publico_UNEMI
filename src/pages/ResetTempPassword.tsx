import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, Home, KeyRound } from "lucide-react";

// Redirección final (otro dominio o local)
const AFTER_CHANGE_REDIRECT = "https://navegador-unemi.onrender.com/login";

function useQuery() {
  const { search } = useLocation();
  return new URLSearchParams(search);
}

export default function ResetTempPassword() {
  const q = useQuery();

  const [email, setEmail] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [showNew2, setShowNew2] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 1. Pone el email de la URL (esto está bien)
    const e = q.get("email") || "";
    if (e) setEmail(e);

    // 2. Escucha CUALQUIER cambio de autenticación
    const { data: authListener } = supabase.auth.onAuthStateChange(
      
      // (event, session) -> Este 'event' es el que nos confundía
      // Ahora solo nos importa el 'session'
      (_event, session) => {
        
        // En cuanto Supabase procese el token de la URL
        // y cree una sesión (session !== null),
        // actualizamos el estado.
        if (session) {
          setHasSession(true);
          setEmail(session.user.email || e);
        }
      }
    );

    // 3. Limpia el listener
    return () => {
      authListener.subscription.unsubscribe();
    };
    
  }, [q]);

  const validNew = useMemo(() => newPw.length >= 8 && newPw === newPw2, [newPw, newPw2]);
  const canSubmit = validNew && !loading && email.trim() && hasSession;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSession) return toast.error("Abre el enlace del correo para continuar.");
    if (!validNew) return toast.error("La nueva contraseña debe tener mínimo 8 caracteres y coincidir.");

    setLoading(true);
    try {
      // 1) Cambiar contraseña (no se pide la antigua porque venimos autenticados del enlace)
      const { error: updErr } = await supabase.auth.updateUser({
        password: newPw,
        data: { require_password_change: false },
      });
      if (updErr) throw updErr;

      // 2) Crear/actualizar perfil en app_users usando metadatos del JWT
      const { data: me } = await supabase.auth.getUser();
      const fullName = (me?.user?.user_metadata as any)?.full_name || email.split("@")[0];
      const role = (me?.user?.user_metadata as any)?.role || "admin";
      const dept = (me?.user?.user_metadata as any)?.department || null;

      const { error: upErr } = await supabase
        .from("app_users")
        .upsert({ usuario: email, nombre: fullName, role, direccion: dept }, { onConflict: "usuario" });
      if (upErr) console.warn("[reset] upsert app_users:", upErr);

      toast.success("Tu contraseña ha sido creada.");
      try { await supabase.auth.signOut(); } finally {
        window.location.href = AFTER_CHANGE_REDIRECT;
      }
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-cover bg-center bg-no-repeat relative" style={{ backgroundImage: `url('/bg-admin.png')` }}>
      <div className="absolute inset-0 bg-black/50" />
      <header className="relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3 text-white/90">
          <Link to="/" className="h-9 w-9 rounded-lg bg-white/15 grid place-items-center ring-1 ring-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="mr-auto">
            <h1 className="text-lg font-semibold leading-tight">UNEMI Campus · Crear contraseña</h1>
            <p className="text-xs text-white/75">
              {hasSession ? "Estás validando tu cuenta. Define tu nueva contraseña." : "Abre el enlace del correo para continuar."}
            </p>
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
                    <KeyRound className="w-5 h-5" />
                    {hasSession ? "Definir nueva contraseña" : "Acceso requerido"}
                  </CardTitle>
                  <CardDescription className="text-white/80">
                    {hasSession
                      ? <>Crea tu contraseña para continuar.</>
                      : <>Primero debes abrir el enlace que te enviamos por correo para crear tu sesión.</>}
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <form onSubmit={handleSubmit} className="grid gap-4">
                    {/* Correo (solo lectura si hay sesión) */}
                    <div className="grid gap-2">
                      <Label htmlFor="email">Correo institucional</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black" />
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                          placeholder="tunombre@unemi.edu.ec" required readOnly={hasSession}
                          className="pl-9 bg-white/90 text-slate-900 placeholder:text-slate-500 focus:bg-white" />
                      </div>
                    </div>

                    {/* Nueva contraseña */}
                    <div className="grid gap-2">
                      <Label htmlFor="newPw">Nueva contraseña</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black" />
                        <Input id="newPw" type={showNew ? "text" : "password"} value={newPw}
                          onChange={(e) => setNewPw(e.target.value)} placeholder="Mínimo 8 caracteres" required
                          className="pl-9 pr-10 bg-white/90 text-slate-900 placeholder:text-slate-500 focus:bg-white" />
                        <button type="button" onClick={() => setShowNew((s) => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-900"
                          aria-label={showNew ? "Ocultar contraseña" : "Mostrar contraseña"}>
                          {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Confirmación */}
                    <div className="grid gap-2">
                      <Label htmlFor="newPw2">Repite la nueva contraseña</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black" />
                        <Input id="newPw2" type={showNew2 ? "text" : "password"} value={newPw2}
                          onChange={(e) => setNewPw2(e.target.value)} placeholder="Debe coincidir" required
                          className="pl-9 pr-10 bg-white/90 text-slate-900 placeholder:text-slate-500 focus:bg-white" />
                        <button type="button" onClick={() => setShowNew2((s) => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-900"
                          aria-label={showNew2 ? "Ocultar contraseña" : "Mostrar contraseña"}>
                          {showNew2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {newPw.length > 0 && newPw.length < 8 && (
                        <p className="text-xs text-red-200">La contraseña debe tener al menos 8 caracteres.</p>
                      )}
                      {newPw2.length > 0 && newPw2 !== newPw && (
                        <p className="text-xs text-red-200">Las contraseñas no coinciden.</p>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button type="button" asChild className="bg-white text-slate-900 hover:bg-white/90">
                        <Link to="/"><Home className="w-4 h-4 mr-2" /> Inicio</Link>
                      </Button>
                      <Button type="submit" disabled={!canSubmit} className="bg-white text-slate-900 hover:bg-white/90">
                        {loading ? "Guardando…" : "Guardar nueva contraseña"}
                      </Button>
                    </div>

                    {!hasSession && (
                      <p className="text-xs text-white/70">Abre el enlace del correo “Activa tu cuenta” para crear la sesión automáticamente.</p>
                    )}
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
