import React from "react";
import ReactDOM from "react-dom/client";
import AdminWhatsAppPanel from "./AdminWhatsAppPanel";
import "./index.css";
import { socket } from "./socket";  // ✅ add this

// ✅ initialize socket once app starts
socket.emit("join", { number: "9148330016" });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AdminWhatsAppPanel />
  </React.StrictMode>
);
