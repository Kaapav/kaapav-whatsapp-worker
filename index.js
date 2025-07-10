require('dotenv').config();
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const OpenAI = require("openai");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ✅ Health Check
app.get('/ping', (req, res) => {
  const mem = process.memoryUsage();
  res.send(`OK | 🧠 Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
});

// ✅ Webhook Verification (Meta)
app.get('/webhooks/whatsapp/cloudapi', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'kaapavverify';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ✅ MongoDB Connect
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB Connect Error:", err.message);
  }
})();

// ✅ Mongoose Schema
const MessageModel = mongoose.model('Message', new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  timestamp: String,
  wa_id: String,
  fullPayload: Object
}));

// ✅ Webhook POST Handler
app.post('/webhooks/whatsapp/cloudapi', async (req, res) => {
  console.log("🔥 POST /webhooks/whatsapp/cloudapi triggered");
  res.sendStatus(200);

  const data = req.body;
  const field = data?.entry?.[0]?.changes?.[0]?.field;
  if (field === "message_echoes") return;

  await saveToMongo(data);
  await handleGPTandCRM(data);
});

// ✅ Save Message to MongoDB
async function saveToMongo(data) {
  try {
    const msg = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    const record = new MessageModel({
      from: msg.from,
      to: data.entry[0].changes[0].value.metadata?.display_phone_number || '',
      text: msg.text?.body || '',
      timestamp: msg.timestamp,
      wa_id: data.entry[0].changes[0].value.contacts?.[0]?.wa_id || '',
      fullPayload: data
    });

    await record.save();
    console.log("✅ Message saved to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB Save Error:", err.message);
  }
}

// ✅ CRM Handler
async function handleGPTandCRM(data) {
  try {
    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const wa_id = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
    const name = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;

    if (!message || !wa_id) return;

    const text = message?.text?.body || '';
    const aiNote = "Test Tag";

    const crmEntry = {
      name: name || "Unknown",
      phone: wa_id,
      message: text,
      ai_note: aiNote,
      timestamp: new Date().toISOString()
    };

    await mongoose.connection.collection("crm_logs").insertOne(crmEntry);
    console.log("🚀 CRM Entry Saved:", crmEntry);

   // ✅ Push to Tiledesk
const requestId = data?.entry?.[0]?.changes?.[0]?.value?.request_id || `whatsapp-${wa_id}`;
const projectId = process.env.TILEDESK_PROJECT_ID; // or hardcode: "686922633c8e640013d7e9ec"

try {
  const tiledeskRes = await axios.post(
    `https://api.tiledesk.com/v3/${projectId}/requests/${requestId}/messages`,
    {
      text: text,
      type: "text"
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.TILEDESK_ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
  console.log("📤 Message pushed to Tiledesk UI ✅", tiledeskRes.status);
} catch (err) {
  console.error("❌ Tiledesk Push Error:", err.response?.data || err.message);
}


// ✅ WhatsApp Send
async function sendWhatsAppReply(to_wa_id, message_text) {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.WA_PHONE_ID}/messages`, {
      messaging_product: "whatsapp",
      to: to_wa_id,
      type: "text",
      text: { body: message_text }
    }, {
      headers: {
        Authorization: `Bearer ${process.env.META_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log("✅ Message sent to WhatsApp:", message_text);
  } catch (err) {
    console.error("❌ WhatsApp Send Error:", err.response?.data || err.message);
  }
}

// ✅ Tiledesk Reply
async function sendTiledeskReply(requestId, replyText) {
  const url = `https://tiledesk.com/v3/686922633c8e640013d7e9ec/requests/${requestId}/messages`;

  try {
    const res = await axios.post(url, {
      text: replyText,
      type: "text"
    }, {
      headers: {
        Authorization: `Bearer ${process.env.TILEDESK_ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log("✅ Auto-reply sent to Tiledesk:", res.status);
  } catch (err) {
    console.error("❌ Tiledesk Reply Error:", err.response?.data || err.message);
  }
}

// ✅ Agent Reply Endpoint
app.post('/tiledesk-agent-reply', async (req, res) => {
  const reply = req.body;
  const message = reply.text;
  const wa_id = reply.recipient;

  await sendWhatsAppReply(wa_id, message);
  res.sendStatus(200);
});

// ✅ Debug CRM Count
app.get('/debug', async (req, res) => {
  const count = await mongoose.connection.collection("crm_logs").countDocuments();
  res.send(`📊 CRM Log Count: ${count} | ✅ Mongo Connected: ${mongoose.connection.readyState === 1}`);
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is live on port ${PORT}`);
});

// ✅ Manual CRM Insert Test
(async () => {
  try {
    await mongoose.connection.collection("crm_logs").insertOne({
      name: "Test Manual",
      phone: "0000000000",
      message: "Manual Insert",
      ai_note: "It worked!",
      timestamp: new Date().toISOString()
    });
    console.log("✅ Manual Test Insert Passed");
  } catch (e) {
    console.error("❌ Manual Test Failed:", e.message);
  }
})();

// ✅ Error Catchers
process.on('uncaughtException', err => {
  console.error("❌ Uncaught Exception:", err.message);
});
process.on('unhandledRejection', (reason, p) => {
  console.error("❌ Unhandled Rejection:", reason);
});
