import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";

import LoginScreen from "./components/LoginScreen";
import DashboardLayout from "./components/DashboardLayout";

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
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem("assbi_auth") === "true";
  });

  function handleLogin() {
    localStorage.setItem("assbi_auth", "true");
    setIsAuthenticated(true);
  }

  function handleLogout() {
    localStorage.removeItem("assbi_auth");
    setIsAuthenticated(false);
  }

  useEffect(() => {
    const auth = localStorage.getItem("assbi_auth");

    if (auth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

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