ilerequire('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { Configuration, OpenAIApi } = require("openai");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ✅ Health Check
app.get('/ping', (req, res) => {
  res.send("OK");
});

// ✅ Webhook Verification (Meta)
app.get('/webhooks/whatsapp/cloudapi', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'kaapavverify';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log("🧪 VERIFY_TOKEN:", VERIFY_TOKEN);
  console.log("🧪 Received token from Meta:", token);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  } else {
    console.error("❌ Webhook verify failed");
    return res.sendStatus(403);
  }
});

// ✅ GPT Setup
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

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

// ✅ Webhook POST Handler with GPT + CRM + Filter for message_echoes
app.post('/webhooks/whatsapp/cloudapi', async (req, res) => {
   console.log("🔥 POST /webhooks/whatsapp/cloudapi triggered");
  console.log("📥 Payload:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200); // Always respond quickly to Meta

  const data = req.body;
  console.log("📩 Received WhatsApp Message", JSON.stringify(data));

  const field = data?.entry?.[0]?.changes?.[0]?.field;

  if (field === "message_echoes") {
    console.log("⚠️ Skipping message_echoes event");
    return;
  }

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

async function handleGPTandCRM(data) {
  try {
    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const wa_id = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
    const name = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;

    console.log("🚀 Step 1: Entered handleGPTandCRM()");
console.log("🚀 Step 2: Full payload = ", JSON.stringify(data, null, 2));
    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
console.log("🚀 Step 3: message = ", message);
const text = message?.text?.body || '';
console.log("🚀 Step 4: Text to GPT = ", text);
console.log("🚀 Step 5: Final CRM Entry = ", crmEntry);

    if (!message || !wa_id) return;

    const text = message?.text?.body || '';
    console.log("🧠 GPT Triggered for:", text);

  const aiNote = "Test Tag";
console.log("🧠 TEMP GPT Note:", aiNote);


    // 📤 Send message back to WhatsApp
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
    console.error("❌ Error sending message to WhatsApp:", err.response?.data || err.message);
  }
}

    // ✅ Save to CRM (Mongo)
    const crmEntry = {
      name: name || "Unknown",
      phone: wa_id,
      message: text,
      ai_note: aiNote || "No note",
      timestamp: new Date().toISOString()
    };
    console.log("🔍 CRM Insertion Attempt:", crmEntry);
await mongoose.connection.collection("crm_logs").insertOne(crmEntry);

    await mongoose.connection.collection("crm_logs").insertOne(crmEntry);
    console.log("✅ CRM Entry Saved:", crmEntry);

    // ✅ Send Auto-Reply via Tiledesk
    const requestId = data?.entry?.[0]?.changes?.[0]?.value?.request_id;
    if (requestId) {
      await sendTiledeskReply(requestId, `Hi ${name || ''} 👋🏼\n\n${aiNote}`);
    }

  } catch (err) {
    console.error("❌ GPT+CRM Error:", err.message);
  }
}

async function sendTiledeskReply(requestId, replyText) {
  const url = `https://tiledesk.com/v3/686922633c8e640013d7e9ec/requests/${requestId}/messages`;

  app.post('/tiledesk-agent-reply', async (req, res) => {
  const reply = req.body;
  const message = reply.text;
  const wa_id = reply.recipient; // Or however you saved the phone

  await sendWhatsAppReply(wa_id, message);

  res.sendStatus(200);
});

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
    console.error("❌ Tiledesk Reply Error:", err.message);
  }
}


    // ✅ Push message to Tiledesk Inbox UI
    await axios.post(
      'https://eu-frankfurt-prod-v3.eks.tiledesk.com/api/chat/686922633c8e640013d7e9ec/messages',
      {
        sender: wa_id,
        text: text,
        attributes: { source: "whatsapp" }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TILEDESK_API_KEY}`
        }
      }
    );

    console.log("📤 Message pushed to Tiledesk UI");

  } catch (err) {
    console.error("❌ GPT+CRM Error:", err.message);
  }
}

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is live on port ${PORT}`);
});

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

process.on('uncaughtException', err => {
  console.error("❌ Uncaught Exception:", err.message);
});

process.on('unhandledRejection', (reason, p) => {
  console.error("❌ Unhandled Rejection:", reason);
});

app.get('/debug', async (req, res) => {
  const count = await mongoose.connection.collection("crm_logs").countDocuments();
  res.send(`📊 CRM Log Count: ${count}`);
});
