// src/pages/Login.tsx
import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, LogIn, UserPlus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshRole, role } = useAuth();
  const redirectTo = (location.state as any)?.from ?? "/";

  const [tab, setTab] = useState<"login" | "register">("login");

  // --- LOGIN ---
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);

  const onSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingLogin(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      await refreshRole();

      if (role === "admin") return navigate("/admin", { replace: true });
      if (role === "student") return navigate("/student", { replace: true });
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo iniciar sesión");
    } finally {
      setLoadingLogin(false);
    }
  };

  // --- REGISTRO (estudiante) ---
  const [stuName, setStuName] = useState("");
  const [stuEmail, setStuEmail] = useState("");
  const [stuPw, setStuPw] = useState("");
  const [showStuPw, setShowStuPw] = useState(false);
  const [loadingReg, setLoadingReg] = useState(false);

  const isUnemiEmail = (e: string) => e.toLowerCase().endsWith("@unemi.edu.ec");

    const onSubmitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stuName.trim()) return toast.error("Ingresa tu nombre completo");
    if (!isUnemiEmail(stuEmail)) return toast.error("Usa tu correo institucional @unemi.edu.ec");
    if (!stuPw || stuPw.length < 8) return toast.error("Contraseña mínima de 8 caracteres");

    setLoadingReg(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: stuEmail,
        password: stuPw,
        options: {
          data: { full_name: stuName, role: "student" },
          emailRedirectTo: `${window.location.origin}/verify`,
        },
      });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("already registered") || msg.includes("already exists")) {
          toast.error("Ese correo ya está registrado. Puedes recuperar tu contraseña.");
          // Abre directamente el diálogo de recuperación con el correo precargado:
          setForgotEmail(stuEmail);
          setForgotOpen(true);
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Te enviamos un correo para confirmar tu cuenta.");
      setTab("login");
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo completar el registro");
    } finally {
      setLoadingReg(false);
    }
  };

  // --- DIALOG: ¿Olvidaste tu contraseña? ---
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  const sendRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = (forgotEmail || email || "").trim();
    if (!mail) return toast.info("Ingresa tu correo institucional.");
    try {
      await supabase.auth.resetPasswordForEmail(mail, {
        // Importante: esta es la pantalla donde el usuario definirá su nueva contraseña
        redirectTo: `${window.location.origin}/reset-password`,
      });
      toast.success("Te enviamos un enlace para restablecer la contraseña.");
      setForgotOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo enviar el enlace");
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
            <h1 className="text-lg font-semibold leading-tight">UNEMI Campus · Acceso</h1>
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
                <CardHeader className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-2xl font-semibold">
                      {tab === "login" ? "Iniciar sesión" : "Registro estudiante"}
                    </CardTitle>
                  </div>
                  <CardDescription className="text-white/80">
                    {tab === "login"
                      ? "Usa tus credenciales institucionales para acceder al panel."
                      : "Crea tu cuenta con correo institucional (@unemi.edu.ec)."}
                  </CardDescription>

                  <div className="mt-3 inline-flex rounded-lg overflow-hidden ring-1 ring-white/20">
                    <button
                      className={`px-3 py-1.5 text-sm ${
                        tab === "login" ? "bg-white text-slate-900" : "bg-transparent text-white/80"
                      }`}
                      onClick={() => setTab("login")}
                    >
                      Iniciar sesión
                    </button>
                    <button
                      className={`px-3 py-1.5 text-sm ${
                        tab === "register" ? "bg-white text-slate-900" : "bg-transparent text-white/80"
                      }`}
                      onClick={() => setTab("register")}
                    >
                      Registro estudiante
                    </button>
                  </div>
                </CardHeader>

                <CardContent>
                  {tab === "login" ? (
                    <form onSubmit={onSubmitLogin} className="grid gap-5" autoComplete="on">
                      <div className="grid gap-2">
                        <label htmlFor="email" className="text-sm text-white/90">
                          Correo
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" />
                          <Input
                            id="email"
                            type="email"
                            autoComplete="username"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="tucorreo@unemi.edu.ec"
                            required
                            className="pl-9 bg-white/90 text-slate-900 placeholder:text-slate-500 focus:bg-white"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <label htmlFor="password" className="text-sm text-white/90">
                          Contraseña
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" />
                          <Input
                            id="password"
                            type={showPw ? "text" : "password"}
                            autoComplete="current-password"
                            value={pw}
                            onChange={(e) => setPw(e.target.value)}
                            placeholder="••••••••"
                            required
                            className="pl-9 pr-10 bg-white/90 text-slate-900 placeholder:text-slate-500 focus:bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPw((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-900"
                            aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                          >
                            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setForgotOpen(true)}
                          className="text-xs text-white/80 hover:text-white underline underline-offset-2"
                        >
                          ¿Olvidaste tu contraseña?
                        </button>
                        <Button type="submit" disabled={loadingLogin} className="bg-white text-slate-900 hover:bg-white/90">
                          <LogIn className="mr-2 h-4 w-4" />
                          {loadingLogin ? "Ingresando…" : "Ingresar"}
                        </Button>
                      </div>
                      <p className="text-center text-xs text-white/70 mt-2">
                        © {new Date().getFullYear()} Universidad Estatal de Milagro — Sistema de Navegación
                      </p>
                    </form>
                  ) : (
                    <form onSubmit={onSubmitRegister} className="grid gap-5">
                      <div className="grid gap-2">
                        <label htmlFor="stuName" className="text-sm text-white/90">
                          Nombre completo
                        </label>
                        <Input
                          id="stuName"
                          value={stuName}
                          onChange={(e) => setStuName(e.target.value)}
                          placeholder="Ej: Ana María Pérez"
                          required
                          className="bg-white/90 text-slate-900 placeholder:text-slate-500 focus:bg-white"
                        />
                      </div>
                      <div className="grid gap-2">
                        <label htmlFor="stuEmail" className="text-sm text-white/90">
                          Correo institucional (@unemi.edu.ec)
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" />
                          <Input
                            id="stuEmail"
                            type="email"
                            value={stuEmail}
                            onChange={(e) => setStuEmail(e.target.value)}
                            placeholder="tunombre@unemi.edu.ec"
                            required
                            className="pl-9 bg-white/90 text-slate-900 placeholder:text-slate-500 focus:bg-white"
                          />
                        </div>
                        {!isUnemiEmail(stuEmail) && stuEmail.length > 0 && (
                          <p className="text-xs text-red-200">El correo debe terminar en @unemi.edu.ec</p>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <label htmlFor="stuPw" className="text-sm text-white/90">
                          Crea tu contraseña
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" />
                          <Input
                            id="stuPw"
                            type={showStuPw ? "text" : "password"}
                            value={stuPw}
                            onChange={(e) => setStuPw(e.target.value)}
                            placeholder="Mínimo 8 caracteres"
                            required
                            className="pl-9 pr-10 bg-white/90 text-slate-900 placeholder:text-slate-500 focus:bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowStuPw((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-900"
                            aria-label={showStuPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                          >
                            {showStuPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {stuPw.length > 0 && stuPw.length < 8 && (
                          <p className="text-xs text-red-200">La contraseña debe tener al menos 8 caracteres.</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-white/80">
                          Recibirás un correo para <b>confirmar</b> tu cuenta.
                        </div>
                        <Button type="submit" disabled={loadingReg} className="bg-white text-slate-900 hover:bg-white/90">
                          <UserPlus className="mr-2 h-4 w-4" />
                          {loadingReg ? "Registrando…" : "Registrarme"}
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* === Dialog Olvidé mi contraseña === */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
            <DialogDescription>
              Ingresa tu correo institucional. Te enviaremos un enlace para crear una nueva contraseña.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4 mt-2" onSubmit={sendRecovery}>
            <div className="grid gap-2">
              <Label htmlFor="forgotEmail">Correo</Label>
              <Input
                id="forgotEmail"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="tucorreo@unemi.edu.ec"
                required
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Enviar enlace</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
