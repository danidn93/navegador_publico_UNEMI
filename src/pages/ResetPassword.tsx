// src/pages/ResetPassword.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, ArrowLeft, Home } from "lucide-react";
import { toast } from "sonner";

function parseHash(): Record<string, string> {
  const h = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(h);
  const out: Record<string, string> = {};
  params.forEach((v, k) => (out[k] = v));
  return out;
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [tokenSet, setTokenSet] = useState(false);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const canSubmit = useMemo(
    () => pw1.length >= 8 && pw2.length >= 8 && pw1 === pw2 && tokenSet,
    [pw1, pw2, tokenSet]
  );

  useEffect(() => {
    const h = parseHash();
    const access_token = h["access_token"];
    const refresh_token = h["refresh_token"];
    (async () => {
      try {
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          setTokenSet(true);
        } else {
          const { data } = await supabase.auth.getSession();
          setTokenSet(!!data.session);
        }
      } catch (e: any) {
        toast.error(e?.message ?? "No se pudo validar el enlace de recuperación.");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      toast.success("Contraseña actualizada. Inicia sesión nuevamente.");
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar la contraseña.");
    }
  };

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
            <h1 className="text-lg font-semibold leading-tight">UNEMI Campus · Recuperar contraseña</h1>
            <p className="text-xs text-white/75">Panel administrativo de navegación</p>
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
                  <CardTitle>Crear nueva contraseña</CardTitle>
                  <CardDescription className="text-white/80">
                    {ready
                      ? tokenSet
                        ? "Ingresa y confirma tu nueva contraseña."
                        : "Enlace inválido o expirado. Solicita nuevamente la recuperación."
                      : "Validando enlace de recuperación…"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {ready && tokenSet ? (
                    <form className="grid gap-4" onSubmit={onSubmit}>
                      <div className="grid gap-2">
                        <label htmlFor="pw1" className="text-sm text-white/90">Nueva contraseña</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" />
                          <Input
                            id="pw1"
                            type="password"
                            minLength={8}
                            value={pw1}
                            onChange={(e) => setPw1(e.target.value)}
                            placeholder="Mínimo 8 caracteres"
                            required
                            className="pl-9 bg-white/90 text-slate-900 placeholder:text-slate-500 focus:bg-white"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <label htmlFor="pw2" className="text-sm text-white/90">Confirmar contraseña</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" />
                          <Input
                            id="pw2"
                            type="password"
                            minLength={8}
                            value={pw2}
                            onChange={(e) => setPw2(e.target.value)}
                            placeholder="Repite la contraseña"
                            required
                            className="pl-9 bg-white/90 text-slate-900 placeholder:text-slate-500 focus:bg-white"
                          />
                        </div>
                      </div>
                      {pw1 && pw2 && pw1 !== pw2 && (
                        <p className="text-xs text-red-200">Las contraseñas no coinciden.</p>
                      )}
                      <div className="flex items-center justify-between">
                        <Button asChild variant="outline" className="text-white border-white/30">
                          <Link className="text-black" to="/login"><Home className="w-4 h-4 mr-2" /> Volver a Login</Link>
                        </Button>
                        <Button type="submit" disabled={!canSubmit} className="bg-white text-slate-900 hover:bg-white/90">
                          Guardar nueva contraseña
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-white/80">
                        {ready ? "El enlace es inválido o expiró." : "Validando enlace…"}
                      </div>
                      <Button asChild variant="outline" className="text-white border-white/30">
                        <Link className="text-black" to="/login"><Home className="text-black w-4 h-4 mr-2" /> Login</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
