import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

document.body.innerHTML = `
  <div class="header">Kaapav WhatsApp Dashboard</div>
  <div class="chat-container">
    <div id="messages" class="messages"></div>
  </div>
`;

const socket = io("/", {
  path: "/socket.io",
  auth: { token: localStorage.getItem("kaapav_token") || "KAAPAV_ADMIN_123" },
  transports: ["websocket", "polling"]
});

socket.on("connect", () => console.log("✅ connected"));
socket.on("incoming_message", (m) => append(m, "received"));
socket.on("outgoing_message", (m) => append(m, "sent"));

function append(msg, type) {
  const box = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = type === "sent" ? "message--sent" : "message--received";
  div.textContent = msg.text || JSON.stringify(msg);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
