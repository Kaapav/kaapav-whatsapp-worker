// main.tsx — one-time seed + render-guards for your clone UI
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./socket"; // ensures socket auth starts

// Seed localStorage so any JSON.parse('token') guards don’t blow up:
localStorage.setItem("token", JSON.stringify({
  id: 1, name: "admin", role: "admin", token: "KAAPAV_ADMIN_123"
}));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
