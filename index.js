/* ---------- bootstrap & libs ---------- */
require("dotenv").config();
const axios    = require("axios");
const express  = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const OpenAI   = require("openai");
console.log("💡 Loaded projectId:", process.env.TILEDESK_PROJECT_ID);
process.on("uncaughtException", err => {
  console.error("⛔ Uncaught Exception:", err);
});

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

console.log("💡 TILEDESK_PROJECT_ID Loaded:", process.env.TILEDESK_PROJECT_ID);
console.log("💡 JWT First 10:", process.env.TILEDESK_ADMIN_TOKEN.slice(0, 10));

/* ---------- GPT + CRM + Tiledesk sync ---------- */
async function handleGPTandCRM(data) {
  try {
    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const wa_id   = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
    const name    = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;

    if (!message || !wa_id) return;

    const text = message?.text?.body || "";
    const aiNote = "Test Tag";
    /* ------------------------------------------------------------------------
       2. Save to your CRM collection
    ------------------------------------------------------------------------ */
    await mongoose.connection.collection("crm_logs").insertOne({
      name: name || "Unknown",
      phone: wa_id,
      message: text,
      ai_note: aiNote,
      timestamp: new Date().toISOString()
    });
    console.log("🚀 CRM log saved for", wa_id);

    //  3. Push the same message into Tiledesk (anonymous‑JWT flow)
         – 100 % free‑tier friendly, no admin token required //
    
    const projectId = process.env.TILEDESK_PROJECT_ID || "686922633c8e640013d7e9ec";
    const requestId =  data?.entry?.[0]?.changes?.[0]?.value?.request_id|| `whatsapp-${wa_id}`;
    const authURL    = "https://api.tiledesk.com/v3/auth/signinAnonymously";
    const TILEDESK_PUSH_URL = `https://api.tiledesk.com/v3/${projectId}/requests/${requestId}/messages`;

    // 3‑a  Get anonymous JWT for Tiledesk
const { data: auth } = await axios.post("https://api.tiledesk.com/v3/auth/signinAnonymously", {
  id_project: projectId,
  firstname: "WhatsApp"
});
const jwt = auth.token;

    
     // 3‑b  build message payload
    const payload = {
      sender: {id: wa_id,name: name || "WhatsApp User"},
      text,
      request_id: requestId,
      attributes: {source: "whatsapp",lead_type: "auto",auto_imported: true}
    };
   const headers = { headers: { Authorization: `JWT ${jwt}`,
    "Content-Type": "application/json" }
                   };
    
// 3‑c  retry‑safe POST (handles 429 rate limits)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await axios.post(pushURL, payload, headers);
        console.log(`📤 Tiledesk push OK (status ${res.status})`);
        break;
      } catch (err) {
        const status = err.response?.status || 0;
        if (status === 429) {
          const wait = 1000 * (attempt + 1);
          console.warn(`⚠️ rate‑limited, retrying in ${wait} ms`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        console.error("❌ Tiledesk push failed:", err.response?.data || err.message);
        break;
      }
    }

  } catch (err) {
    console.error("❌ handleGPTandCRM() fatal:", err.message);
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



    console.log("💡 Final Tiledesk Push Payload:", JSON.stringify(payload));
    console.log("💡 Final URL:", TILEDESK_PUSH_URL);
