const rawApiUrl = import.meta.env.VITE_API_URL;

export const API_BASE =
  typeof rawApiUrl === "string"
    ? rawApiUrl.replace(/\/$/, "")
    : "http://localhost:8000";
