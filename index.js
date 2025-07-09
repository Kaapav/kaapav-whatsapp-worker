require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ✅ Health Check
app.get('/ping', (req, res) => {
  res.send("OK");
});

// ✅ Webhook Verify (Meta)
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

// ✅ WhatsApp POST Handler
app.post('/webhooks/whatsapp/cloudapi', (req, res) => {
  console.log("📩 Received WhatsApp Message", JSON.stringify(req.body));
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Server is live on port ${PORT}`);
});

const { Configuration, OpenAIApi } = require("openai");
const axios = require("axios");

// ✅ GPT Setup
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY // ✅ Add this to .env
});
const openai = new OpenAIApi(configuration);

// ✅ Generate GPT Reply
async function getGPTReply(userText) {
  const response = await openai.createChatCompletion({
    model: "gpt-4", // or gpt-3.5-turbo
    messages: [{ role: "user", content: userText }],
    temperature: 0.7,
  });
  return response.data.choices[0].message.content;
}

const MessageModel = mongoose.model('Message', new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  timestamp: String,
  wa_id: String,
  fullPayload: Object
}));

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
