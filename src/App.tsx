// src/App.tsx
import { Routes, Route } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import PublicNavigator from "@/components/PublicNavigator";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider } from "@/contexts/AuthContext";

// Ajusta estos imports a tus rutas reales
import AdminNavigator from "@/pages/AdminNavigator";
import StudentNavigator from "@/pages/StudentNavigator";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import ResetTempPassword from "./pages/ResetTempPassword";

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <Toaster richColors position="top-right" />
        <Routes>
          {/* Público */}
          <Route path="/" element={<PublicNavigator />} />

          {/* Login */}
          <Route path="/login" element={<Login />} />

          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route path="/reset-temp-password" element={<ResetTempPassword />} />

          {/* Protegidas */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowed={["admin"]}>
                <AdminNavigator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student"
            element={
              <ProtectedRoute allowed={["student"]}>
                <StudentNavigator />
              </ProtectedRoute>
            }
          />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  );
}
