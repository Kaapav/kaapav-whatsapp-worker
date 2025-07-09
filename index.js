require('dotenv').config();
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

// ✅ Handle GPT + CRM Write
async function handleGPTandCRM(data) {
  try {
    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const wa_id = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
    const name = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;

    if (!message || !wa_id) return;

    const text = message?.text?.body || '';
    console.log("🧠 GPT Triggered for:", text);

    // ✅ GPT Call
    const completion = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a CRM tagging assistant for a jewellery business. Read customer message and generate a one-line tag." },
        { role: "user", content: text }
      ],
      max_tokens: 50
    });

    const aiNote = completion.data.choices?.[0]?.message?.content?.trim();
    console.log("🧠 GPT Note:", aiNote);

    const crmEntry = {
      name: name || "Unknown",
      phone: wa_id,
      message: text,
      ai_note: aiNote || "No note",
      timestamp: new Date().toISOString()
    };

    await mongoose.connection.collection("crm_logs").insertOne(crmEntry);
    console.log("✅ CRM Entry Saved:", crmEntry);

  } catch (err) {
    console.error("❌ GPT+CRM Error:", err.message);
  }
}

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is live on port ${PORT}`);
});
