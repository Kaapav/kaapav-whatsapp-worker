// -------------------------------------------------------------
// Kaapav WhatsApp Worker – FINAL ESM VERSION with Polling (v28)
//  - Non‑webhook 2‑way reply loop (polls Tiledesk every 10 s)
//  - Removes deprecated Mongo flags & request‑create warnings
//  - Clean logging & GPT placeholder
// -------------------------------------------------------------

import 'dotenv/config';
import axios from 'axios';
import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import cors from 'cors';
import OpenAI from 'openai';

// ---- Fail fast on critical env vars -----------------------------------------
['MONGO_URI', 'TILEDESK_PROJECT_ID', 'TILEDESK_BOT_ID', 'TILEDESK_BOT_TOKEN',
 'META_TOKEN', 'META_PHONE_ID']
  .forEach((k) => {
    if (!process.env[k]) {
      console.error(`❌ Missing env: ${k}`);
      process.exit(1);
    }
  });

// ---- OpenAI init (optional) --------------------------------------------------
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ---- Express setup -----------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(bodyParser.json());

// ---- Mongo connection --------------------------------------------------------
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ Mongo connection failed:', err.message);
    process.exit(1);
  }
})();

// ---- Mongoose model ----------------------------------------------------------
const MessageModel = mongoose.model(
  'Message',
  new mongoose.Schema({
    from: String,
    to: String,
    text: String,
    timestamp: String,
    wa_id: String,
    fullPayload: Object,
  }, { collection: 'messages' })
);

// ---- Globals for polling -----------------------------------------------------
const trackedWA = new Map(); // wa_id -> last agent message _id

// ---- WhatsApp Incoming Webhook ----------------------------------------------
app.post('/webhooks/whatsapp/cloudapi', async (req, res) => {
  res.sendStatus(200);
  const change = req.body?.entry?.[0]?.changes?.[0];
  if (!change || change.field === 'message_echoes') return;

  await Promise.all([
    saveToMongo(change),
    handleGPTandCRM(change),
  ]);
});

async function saveToMongo(change) {
  try {
    const msg = change.value?.messages?.[0];
    if (!msg) return;

    await MessageModel.create({
      from: msg.from,
      to: change.value?.metadata?.display_phone_number || '',
      text: msg.text?.body || '',
      timestamp: msg.timestamp,
      wa_id: change.value?.contacts?.[0]?.wa_id || '',
      fullPayload: change,
    });
    console.log('✅ Message saved');
  } catch (err) {
    console.error('❌ Mongo save failed:', err.message);
  }
}

async function handleGPTandCRM(change) {
  try {
    const msg = change.value?.messages?.[0];
    const contact = change.value?.contacts?.[0];
    if (!msg || !contact) return;

    const wa_id = contact.wa_id;
    const name = contact.profile?.name || 'Unknown';
    const text = msg.text?.body || '';

    // Log inbound msg
    console.log(`📥 Incoming Msg\n• Name: ${name}\n• WA: ${wa_id}\n• Text: ${text}`);


    // Track WA for polling
    if (!trackedWA.has(wa_id)) trackedWA.set(wa_id, null);

    // CRM insert
    await mongoose.connection.collection('crm_logs').insertOne({
      name,
      phone: wa_id,
      message: text,
      ai_note: 'Lead',
      timestamp: new Date().toISOString(),
    });
    console.log('🚀 CRM log inserted');

    // Push to Tiledesk (request is auto‑created by Tiledesk’s WA integration)
    await pushToTiledesk({ text, wa_id });
  } catch (err) {
    console.error('❌ handleGPTandCRM fatal:', err.message);
  }
}

async function pushToTiledesk({ text, wa_id }) {
  const projectId = process.env.TILEDESK_PROJECT_ID;
  const requestId = `support-group-${wa_id}`;
  const jwtRaw = process.env.TILEDESK_BOT_TOKEN;
  const jwt = jwtRaw.startsWith('JWT ') ? jwtRaw : `JWT ${jwtRaw}`;

  const pushURL = `https://api.tiledesk.com/v3/${projectId}/requests/${requestId}/messages`;
  const payload = {
    sender: process.env.TILEDESK_BOT_ID,
    createdBy: process.env.TILEDESK_BOT_ID,
    text,
    request_id: requestId,
    attributes: { source: 'whatsapp', wa_id, auto_imported: true },
  };

  try {
    const res = await axios.post(pushURL, payload, {
      headers: { Authorization: jwt, 'Content-Type': 'application/json' },
    });
    console.log('📤 WA → Tiledesk PUSH ✅', res.status);
  } catch (err) {
    console.error('❌ Tiledesk push failed:', err.response?.data || err.message);
  }
}

// ---- POLLING LOOP: Tiledesk → WhatsApp --------------------------------------
const TD_API = `https://api.tiledesk.com/v3/${process.env.TILEDESK_PROJECT_ID}`;
const TD_JWT = (process.env.TILEDESK_BOT_TOKEN.startsWith('JWT ') ? '' : 'JWT ') + process.env.TILEDESK_BOT_TOKEN;

async function pollTiledesk() {
  for (const [wa_id, lastId] of trackedWA.entries()) {
    const requestId = `support-group-${wa_id}`;
    try {
      const { data } = await axios.get(`${TD_API}/requests/${requestId}/messages?limit=5`, {
        headers: { Authorization: TD_JWT },
      });

      // Find newest agent message (not from bot & not from whatsapp)
      const latest = data?.docs?.reverse().find((m) =>
        m.sender !== process.env.TILEDESK_BOT_ID && m.attributes?.source !== 'whatsapp'
      );
      if (!latest) continue;

      if (latest._id === lastId) continue; // already sent
      trackedWA.set(wa_id, latest._id);

      // Push to WhatsApp via Meta
      await axios.post(`https://graph.facebook.com/v19.0/${process.env.META_PHONE_ID}/messages`, {
        messaging_product: 'whatsapp',
        to: wa_id,
        type: 'text',
        text: { body: latest.text },
      }, {
        headers: { Authorization: `Bearer ${process.env.META_TOKEN}`, 'Content-Type': 'application/json' },
      });
      console.log('🔄 Tiledesk → WA SENT:', wa_id, latest.text);
    } catch (err) {
      console.error('❌ Poll error for', wa_id, err.response?.data || err.message);
    }
  }
}

// Start polling every 10 seconds
setInterval(pollTiledesk, 10_000);

// ---- Start server -----------------------------------------------------------
app.listen(PORT, () => console.log(`🚀 Live on port ${PORT}`));
