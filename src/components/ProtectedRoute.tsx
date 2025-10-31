// src/components/ProtectedRoute.tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";

export default function ProtectedRoute({
  allowed,
  children,
}: {
  allowed: AppRole[];   // p.ej.: ['admin'] o ['student','admin']
  children: JSX.Element;
}) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // o spinner

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!allowed.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
