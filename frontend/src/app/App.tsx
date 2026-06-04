import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";

import LoginScreen from "./components/LoginScreen";
import DashboardLayout from "./components/DashboardLayout";
import { API_BASE } from "./lib/config";
import { useI18n } from "./lib/i18n";

const DashboardOverview = lazy(() => import("./components/pages/DashboardOverview"));
const LiveSurveillance = lazy(() => import("./components/pages/LiveSurveillance"));
const CrowdAnalytics = lazy(() => import("./components/pages/CrowdAnalytics"));
const ObjectDetection = lazy(() => import("./components/pages/ObjectDetection"));
const FineTuning = lazy(() => import("./components/pages/FineTuning"));
const AnomalyDetection = lazy(() => import("./components/pages/AnomalyDetection"));
const PredictiveAnalytics = lazy(() => import("./components/pages/PredictiveAnalytics"));
const Reports = lazy(() => import("./components/pages/Reports"));
const GovernanceEvaluation = lazy(() => import("./components/pages/GovernanceEvaluation"));
const AIChatbot = lazy(() => import("./components/pages/AIChatbot"));
const Settings = lazy(() => import("./components/pages/Settings"));

function PageLoading() {
  return (
    <div className="min-h-[420px] w-full bg-background text-foreground flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>
    </div>
  );
}

export default function App() {
  const { t } = useI18n();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    try {
      document.documentElement.classList.toggle(
        "dark",
        localStorage.getItem("assbi_theme") !== "light"
      );
    } catch {
      document.documentElement.classList.add("dark");
    }
  }, []);

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
      <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center">
        <div className="text-sm text-muted-foreground">{t("common.checkingSession")}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="size-full">
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
              element={<Suspense fallback={<PageLoading />}><DashboardOverview /></Suspense>}
            />

            <Route
              path="surveillance"
              element={<Suspense fallback={<PageLoading />}><LiveSurveillance /></Suspense>}
            />

            <Route
              path="crowd"
              element={<Suspense fallback={<PageLoading />}><CrowdAnalytics /></Suspense>}
            />

            <Route
              path="objects"
              element={<Suspense fallback={<PageLoading />}><ObjectDetection /></Suspense>}
            />

            <Route
              path="fine-tuning"
              element={<Suspense fallback={<PageLoading />}><FineTuning /></Suspense>}
            />

            <Route
              path="anomalies"
              element={<Suspense fallback={<PageLoading />}><AnomalyDetection /></Suspense>}
            />

            <Route
              path="predictive"
              element={<Suspense fallback={<PageLoading />}><PredictiveAnalytics /></Suspense>}
            />

            <Route
              path="reports"
              element={<Suspense fallback={<PageLoading />}><Reports /></Suspense>}
            />

            <Route
              path="evaluation"
              element={<Suspense fallback={<PageLoading />}><GovernanceEvaluation /></Suspense>}
            />

            <Route
              path="chatbot"
              element={<Suspense fallback={<PageLoading />}><AIChatbot /></Suspense>}
            />

            <Route
              path="settings"
              element={<Suspense fallback={<PageLoading />}><Settings /></Suspense>}
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
