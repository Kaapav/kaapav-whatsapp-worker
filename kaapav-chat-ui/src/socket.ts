// socket.ts
import { io } from "socket.io-client";

export const ADMIN_TOKEN = "KAAPAV_ADMIN_123";               // from backend env
export const API_BASE    = "https://www.crm.kaapav.com/api"; // from VITE_API_URL
export const SOCKET_HOST = "https://www.crm.kaapav.com";     // same origin as API

export const socket = io(SOCKET_HOST, {
  transports: ["websocket", "polling"],
  auth: { token: ADMIN_TOKEN }, // backend checks this
  path: "/socket.io",           // default; keep unless you changed Nginx
});

// Optional: show connection state in UI
socket.on("connect",    () => console.log("✅ socket connected", socket.id));
socket.on("disconnect", () => console.log("⚠️ socket disconnected"));
