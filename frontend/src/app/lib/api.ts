import { API_BASE } from "./config";

export async function getSummary() {
  const res = await fetch(`${API_BASE}/api/summary`);
  if (!res.ok) throw new Error("API summary request failed");
  return res.json();
}

export async function getAnalytics(limit = 200) {
  const res = await fetch(`${API_BASE}/api/analytics?limit=${limit}`);
  if (!res.ok) throw new Error("API analytics request failed");
  return res.json();
}

export async function getIncidents(limit = 100) {
  const res = await fetch(`${API_BASE}/api/incidents?limit=${limit}`);
  if (!res.ok) throw new Error("API incidents request failed");
  return res.json();
}
