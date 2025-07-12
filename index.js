// -------------------------------------------------------------
// Kaapav WhatsApp Worker – FINAL GOAT VERSION (12 Jul 2025)
// -------------------------------------------------------------
// • ES‑module syntax (package.json "type":"module")
// • Bullet‑proof .env validation
// • Mongo save + CRM log + Tiledesk push
// • OpenAI ready (v4 SDK) – swap ai_note logic when needed
// • CORS enabled for future dashboard access
// -------------------------------------------------------------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
import 'dotenv/config';
import axios from 'axios';
import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import cors from 'cors';
import OpenAI from 'openai';

// ---- Fast‑fail if critical env vars are missing ------------------------------
['OPENAI_API_KEY', 'MONGO_URI', 'TILEDESK_PROJECT_ID', 'TILEDESK_BOT_ID', 'TILEDESK_BOT_TOKEN']
  .forEach((k) => {
    if (!process.env[k]) {
      console.error(`❌ Missing env: ${k}`);
      process.exit(1);
    }
  });
// After (clean fix for Render)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config(); // use .env only for local testing
}
// ---- OpenAI init -------------------------------------------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  new mongoose.Schema(
    {
      from: String,
      to: String,
      text: String,
      timestamp: String,
      wa_id: String,
      fullPayload: Object,
    },
    { collection: 'messages' }
  )
);

// ---- Webhook endpoint --------------------------------------------------------
app.post('/webhooks/whatsapp/cloudapi', async (req, res) => {
  // Respond ASAP to Meta
  res.sendStatus(200);

  // Work with the first change only (Meta batches rarely)
  const change = req.body?.entry?.[0]?.changes?.[0];
  if (!change || change.field === 'message_echoes') return; // ignore echoes

  // Async in parallel – no await blocking Meta
  await Promise.all([saveToMongo(change), handleGPTandCRM(change)]);
});

// ---- Save raw message to Mongo ----------------------------------------------
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

// ---- GPT tagging, CRM log & Tiledesk push -----------------------------------
async function handleGPTandCRM(change) {
  try {
    const msg = change.value?.messages?.[0];
    const contact = change.value?.contacts?.[0];
    if (!msg || !contact) return;

    const wa_id = contact.wa_id;
    const name = contact.profile?.name || 'Unknown';
    const text = msg.text?.body || '';

    // --- Simple AI note placeholder (replace with real GPT call) --------------
    const ai_note = 'Lead';
    // Example GPT usage (uncomment if you want real inference)
    // const gptRes = await openai.chat.completions.create({
    //   model: 'gpt-4o-mini',
    //   messages: [
    //     { role: 'system', content: 'Classify the user intent.' },
    //     { role: 'user', content: text },
    //   ],
    // });
    // const ai_note = gptRes.choices[0].message.content.trim();

    await mongoose.connection.collection('crm_logs').insertOne({
      name,
      phone: wa_id,
      message: text,
      ai_note,
      timestamp: new Date().toISOString(),
    });
    console.log('🚀 CRM log inserted');

    await pushToTiledesk({ text, wa_id });
  } catch (err) {
    console.error('❌ handleGPTandCRM fatal:', err.message);
  }
}

// ---- Push message into Tiledesk request -------------------------------------
async function pushToTiledesk({ text, wa_id }) {
  const projectId = process.env.TILEDESK_PROJECT_ID;
  const requestId = `support-group-${wa_id}`;
  const jwtRaw = process.env.TILEDESK_BOT_TOKEN;
  const jwt = jwtRaw.startsWith('JWT ') ? jwtRaw : `JWT ${jwtRaw}`;

  // Ensure request exists (idempotent)
  try {
    await axios.post(
      `https://api.tiledesk.com/v3/${projectId}/requests`,
      {
        request_id: requestId,
        departmentid: process.env.TILEDESK_DEPT_ID || undefined,
        source: 'whatsapp',
      },
      {
        headers: { Authorization: jwt, 'Content-Type': 'application/json' },
      }
    );
    console.log('✅ Request ensured/created');
  } catch (err) {
    if (err.response?.status !== 409) {
      console.warn('⚠️ Request create failed:', err.response?.data?.msg || err.message);
    }
  }

  // Push user message into the thread
  const pushURL = `https://api.tiledesk.com/v3/${projectId}/requests/${requestId}/messages`;
  const payload = {
    sender: process.env.TILEDESK_BOT_ID,
    createdBy: process.env.TILEDESK_BOT_ID,
    text,
    request_id: requestId,
    attributes: {
      source: 'whatsapp',
      wa_id,
      lead_type: 'auto',
      auto_imported: true,
    },
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.post(pushURL, payload, {
        headers: { Authorization: jwt, 'Content-Type': 'application/json' },
      });
      console.log('📤 Message pushed ✅', res.status);
      break;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        console.warn('⏳ Rate limited, retrying...');
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.error('❌ Tiledesk push failed:', err.response?.data || err.message);
      break;
    }
  }
}

// ---- Start server -----------------------------------------------------------
app.listen(PORT, () => console.log(`🚀 Live on port ${PORT}`));
