// src/waBridge.ts
import { io } from "socket.io-client";

export const socket = io(import.meta.env.VITE_SOCKET_URL, {
  path: "/socket.io/",
  transports: ["websocket", "polling"],
  auth: { token: import.meta.env.VITE_ADMIN_TOKEN }, // keep in sync with worker
});

// Shared in-memory store the clone can read
export const WA = {
  status: "idle" as "idle" | "scan" | "ready" | "connecting",
  qr: null as string | null,
  contacts: [] as any[],
  chats: [] as any[],
  messages: new Map<string, any[]>(), // chatId -> msgs
};

socket.on("connect", () => console.log("WS OK", socket.id));
socket.on("connect_error", (e) => console.log("WS FAIL", e?.message));

// Kick a session for your number
export function startSession(phone: string = "9148330016") {
  socket.emit("wa:session:start", { phone });
  WA.status = "connecting";
}

// Worker → UI events (names must match your worker)
socket.on("wa:qr", (qrPngBase64: string) => {
  WA.qr = qrPngBase64;
  WA.status = "scan";
});

socket.on("wa:ready", (info) => {
  WA.status = "ready";
  WA.qr = null;
  console.log("WhatsApp ready:", info);
});

socket.on("wa:contacts", (list: any[]) => {
  WA.contacts = Array.isArray(list) ? list : [];
});

socket.on("wa:chats", (list: any[]) => {
  WA.chats = Array.isArray(list) ? list : [];
});

socket.on("wa:msg", ({ chatId, message }) => {
  const arr = WA.messages.get(chatId) || [];
  arr.push(message);
  WA.messages.set(chatId, arr);
});
