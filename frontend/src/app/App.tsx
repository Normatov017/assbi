import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";

import LoginScreen from "./components/LoginScreen";
import DashboardLayout from "./components/DashboardLayout";
import { API_BASE } from "./lib/config";

import DashboardOverview from "./components/pages/DashboardOverview";
import LiveSurveillance from "./components/pages/LiveSurveillance";
import CrowdAnalytics from "./components/pages/CrowdAnalytics";
import ObjectDetection from "./components/pages/ObjectDetection";
import AnomalyDetection from "./components/pages/AnomalyDetection";
import PredictiveAnalytics from "./components/pages/PredictiveAnalytics";
import Reports from "./components/pages/Reports";
import AIChatbot from "./components/pages/AIChatbot";
import Settings from "./components/pages/Settings";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  function handleLogin(user?: unknown) {
    localStorage.setItem("assbi_auth", "true");
    if (user) {
      localStorage.setItem("assbi_user", JSON.stringify(user));
    }
    setIsAuthenticated(true);
  }

  function handleLogout() {
    localStorage.removeItem("assbi_auth");
    setIsAuthenticated(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json().catch(() => null);

        if (!cancelled && res.ok && data?.user) {
          handleLogin(data.user);
          setIsCheckingSession(false);
          return;
        }
      } catch {
        // Login screen will handle new authentication.
      }

      if (!cancelled) {
        localStorage.removeItem("assbi_auth");
        localStorage.removeItem("assbi_user");
        setIsAuthenticated(false);
      }

      if (!cancelled) {
        setIsCheckingSession(false);
      }
    }

    verifySession();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isCheckingSession) {
    return (
      <div className="dark min-h-screen w-full bg-[#070b1f] text-white flex items-center justify-center">
        <div className="text-sm text-white/70">Checking secure session...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="dark size-full">
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <DashboardLayout />
            }
          >
            <Route
              index
              element={<DashboardOverview />}
            />

            <Route
              path="surveillance"
              element={<LiveSurveillance />}
            />

            <Route
              path="crowd"
              element={<CrowdAnalytics />}
            />

            <Route
              path="objects"
              element={<ObjectDetection />}
            />

            <Route
              path="anomalies"
              element={<AnomalyDetection />}
            />

            <Route
              path="predictive"
              element={<PredictiveAnalytics />}
            />

            <Route
              path="reports"
              element={<Reports />}
            />

            <Route
              path="chatbot"
              element={<AIChatbot />}
            />

            <Route
              path="settings"
              element={<Settings />}
            />
          </Route>

          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
