console.log("🧭 Current working directory:", process.cwd());const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config({ path: __dirname + "/.env" });

const { sendMessage } = require("./sendMessage"); // RELATIVE path — works best

const app = express();
const PORT = process.env.PORT || 5555;

// Middleware
app.use(bodyParser.json());

// Verification route (Webhook GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === process.env.VERIFY_TOKEN) {
    console.log("Webhook verified ✅");
    return res.status(200).send(challenge);
  } else {
    console.warn("Webhook verification failed ❌");
    return res.sendStatus(403);
  }
});

// Message handler (Webhook POST)
app.post("/webhook", async (req, res) => {
  const entry = req.body.entry?.[0];
  const message = entry?.changes?.[0]?.value?.messages?.[0];

  if (message) {
    try {
      await sendMessage(message);
    } catch (err) {
      console.error("❌ Error in sendMessage:", err);
    }
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("🧠 Kaapav WhatsApp Bot is live!");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Bot live on port ${PORT}`);
});
