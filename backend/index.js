const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();
const { sendMessage } = require("./sendMessage");

const app = express();
app.use(bodyParser.json());

// ✅ WhatsApp webhook verification
app.get("/webhooks/whatsapp/cloudapi", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

// ✅ WhatsApp webhook message receiver
app.post("/webhooks/whatsapp/cloudapi", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = entry?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body?.toLowerCase() || "";

    let reply = "🤖 Sorry, I didn't understand. Try:\n- Bracelet\n- Offers\n- Track";

    if (text.includes("bracelet")) {
      reply = "💎 *Bracelets Collection*\nElegance awaits:\nhttps://kaapav.com/bracelets";
    } else if (text.includes("offer")) {
      reply = "🎉 *Flat 50% OFF!*\nVisit: https://kaapav.com/offers";
    } else if (text.includes("track")) {
      reply = "📦 *Track Order*: https://www.shiprocket.in/shipment-tracking/";
    }

    await sendMessage(from, reply);
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error handling message:", err);
    res.sendStatus(500);
  }
});

// ♻️ Anti-sleep loop for Render
setInterval(() => {
  console.log("♻️ Ping loop active to prevent Render sleep");
}, 4 * 60 * 1000); // every 4 minutes

// ✅ Port binding logic
const PORT = process.env.PORT || 5555;

// 🚀 Safe listener with global EADDRINUSE shield
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Bot live on port ${PORT}`);
});

// 🚨 If port is already used, exit safely
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} already in use. Exiting...`);
    process.exit(1);
  } else {
    console.error("❌ Unexpected server error:", err);
    process.exit(1);
  }
});

// 🛑 Graceful shutdown hook
process.on("SIGINT", () => {
  console.log("🛑 Gracefully shutting down...");
  process.exit();
});

// 🔥 Emergency catch for unhandled port errors
process.on("uncaughtException", function (err) {
  if (err.code === "EADDRINUSE") {
    console.error("❌ Port already in use. Exiting...");
    process.exit(1);
  } else {
    console.error("❌ Uncaught Exception:", err);
    process.exit(1);
  }
});
