import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const [checking, setChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setIsAuthed(!!data.session);
      setChecking(false);
    })();
  }, []);

  if (checking) return <div style={{ padding: 16 }}>Cargando…</div>;
  if (!isAuthed) return <Navigate to="/login" replace />;
  return children;
}
