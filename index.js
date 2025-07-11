/* ---------- bootstrap & libs ---------- */
require("dotenv").config();
const axios    = require("axios");
const express  = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const OpenAI   = require("openai");

/* ---------- express ---------- */
const app  = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());

/* ---------- health ---------- */
app.get("/ping", (req, res) => {
  const mem = process.memoryUsage();
  res.send(`OK | 🧠 Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
});

/* ---------- meta webhook verify ---------- */
app.get("/webhooks/whatsapp/cloudapi", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "kaapavverify";
  const { ["hub.mode"]: mode, ["hub.verify_token"]: token, ["hub.challenge"]: challenge } = req.query;

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* ---------- GPT / Mongo bootstrap ---------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB Error:", err.message);
  }
})();

/* ---------- schema ---------- */
const MessageModel = mongoose.model(
  "Message",
  new mongoose.Schema({
    from: String,
    to: String,
    text: String,
    timestamp: String,
    wa_id: String,
    fullPayload: Object
  })
);

/* ---------- main webhook ---------- */
app.post("/webhooks/whatsapp/cloudapi", async (req, res) => {
  console.log("🔥 POST /webhooks/whatsapp/cloudapi triggered");
  res.sendStatus(200);

  const data  = req.body;
  const field = data?.entry?.[0]?.changes?.[0]?.field;
  if (field === "message_echoes") return;

  await saveToMongo(data);
  await handleGPTandCRM(data);
});

/* ---------- save inbound ---------- */
async function saveToMongo(data) {
  try {
    const msg = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    const record = new MessageModel({
      from: msg.from,
      to: data.entry[0].changes[0].value.metadata?.display_phone_number || "",
      text: msg.text?.body || "",
      timestamp: msg.timestamp,
      wa_id: data.entry[0].changes[0].value.contacts?.[0]?.wa_id || "",
      fullPayload: data
    });

    await record.save();
    console.log("✅ Message saved to MongoDB");
  } catch (err) {
    console.error("❌ Mongo Save Error:", err.message);
  }
}

/* ---------- GPT + CRM + Tiledesk sync ---------- */
async function handleGPTandCRM(data) {
  try {
    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const wa_id   = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
    const name    = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
    
    if (!message || !wa_id) return;

    const text    = message?.text?.body || "";
    const aiNote  = "Test Tag";

    /* ---- log to CRM ---- */
    const crmEntry = {
      name: name || "Unknown",
      phone: wa_id,
      message: text,
      ai_note: aiNote,
      timestamp: new Date().toISOString()
    };
    await mongoose.connection.collection("crm_logs").insertOne(crmEntry);
    console.log("🚀 CRM Entry Saved:", crmEntry);

    console.log("💡 TILEDESK_PROJECT_ID Loaded:", process.env.TILEDESK_PROJECT_ID);
    const projectId = process.env.TILEDESK_PROJECT_ID || "686922633c8e640013d7e9ec";

    /* ---- push to Tiledesk ---- */
    const requestId        = data?.entry?.[0]?.changes?.[0]?.value?.request_id || `whatsapp-${wa_id}`;
   const TILEDESK_PUSH_URL =
  `https://eu-frankfurt-prod-v3.eks.tiledesk.com/api/${projectId}/requests/${requestId}/messages`;


    const payload = {
      sender: {
        id: wa_id,
        name: name || "WhatsApp User"
      },
      text,
      request_id: requestId,
      attributes: {
        source: "whatsapp",
        lead_type: "auto",
        auto_imported: true
      }
    };

    const headers = {
      headers: {
        Authorization: `Bearer ${process.env.TILEDESK_ADMIN_TOKEN}`,
        "Content-Type": "application/json"
      }
    };

    /* retry‑safe push (handles 429) */
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      try {
        const res = await axios.post(TILEDESK_PUSH_URL, payload, headers);
        console.log("📤 Tiledesk UI Push ✅", res.status);
        break;
      } catch (err) {
        const status = err.response?.status;
        if (status === 429) {
          const wait = 1000 * (attempt + 1);
          console.warn(`⚠️ Rate limit hit. Retry in ${wait} ms`);
          await new Promise(r => setTimeout(r, wait));
          attempt++;
        } else {
          console.error("❌ Final Tiledesk Push Error:", err.response?.data || err.message);
          break;
        }
      }
    }
  } catch (err) {
    console.error("❌ GPT+CRM Error:", err.message);
  }
}

/* ---------- WhatsApp replies from agents ---------- */
async function sendWhatsAppReply(to_wa_id, message_text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.WA_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to_wa_id,
        type: "text",
        text: { body: message_text }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.META_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("✅ WhatsApp Message Sent:", message_text);
  } catch (err) {
    console.error("❌ WhatsApp Send Error:", err.response?.data || err.message);
  }
}

app.post("/tiledesk-agent-reply", async (req, res) => {
  const { text, recipient: wa_id } = req.body;
  await sendWhatsAppReply(wa_id, text);
  res.sendStatus(200);
});

/* ---------- debug ---------- */
app.get("/debug", async (req, res) => {
  const count = await mongoose.connection.collection("crm_logs").countDocuments();
  res.send(`📊 CRM Log Count: ${count} | ✅ Mongo Connected: ${mongoose.connection.readyState === 1}`);
});

/* ---------- harden ---------- */
process.on("uncaughtException", err => console.error("❌ Uncaught Exception:", err.message));
process.on("unhandledRejection",  err => console.error("❌ Unhandled Rejection:", err));

/* ---------- start ---------- */
app.listen(PORT, () => console.log(`🚀 Server is live on port ${PORT}`));
