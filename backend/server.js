// server.js (backend on Render)
import express from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
import http from "http";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }});

app.use(cors());
app.use(express.json());

// Mongo
mongoose.connect(process.env.MONGO_URI);

// Socket.IO
io.of("/chat").on("connection", (socket) => {
  console.log("Agent connected:", socket.id);
});

// WhatsApp Webhook
app.post("/api/webhook/whatsapp", (req, res) => {
  const msg = req.body;
  // Save to Mongo...
  io.of("/chat").emit("message", msg); // 🔥 send to frontend instantly
  res.sendStatus(200);
});

// Send WhatsApp msg
app.post("/api/messages/send", async (req, res) => {
  const { number, text } = req.body;
  const r = await fetch(
    `https://graph.facebook.com/v18.0/${process.env.WA_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: number,
        type: "text",
        text: { body: text },
      }),
    }
  );
  const data = await r.json();
  res.json(data);
});
