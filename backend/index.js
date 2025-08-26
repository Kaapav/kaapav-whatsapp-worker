// index.js
// KAAPAV_AUTORESPONDER_V∞ — Final (CommonJS)
// Place at repo root. npm i express axios body-parser mongoose dotenv

console.log("🗭 CWD:", process.cwd());

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const sendMessage = require("./utils/sendMessage");
const handleButtonClick = require("./utils/buttonHandler");

// ENV
const {
  PORT = 5555,
  VERIFY_TOKEN,
  WA_PHONE_ID,
  WHATSAPP_TOKEN,
  MONGO_URI,
  BASE_URL, // e.g. https://kaapav-whatsapp-worker.onrender.com
  KEEPALIVE_INTERVAL_MS = 300000, // default 5 min
  SESSION_TTL_MIN = 0, // 0 = persist until restart
  APP_SECRET // optional for signature verification
} = process.env;

const app = express();
app.use(bodyParser.json({ limit: "1mb" }));

// ---------- MongoDB (optional) ----------
let SessionModel = null;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log("✅ MongoDB connected");
      // define model after connection (safe)
      try {
        const schema = new mongoose.Schema({
          userId: { type: String, index: true, unique: true },
          lastMenu: String,
          meta: Object,
          updatedAt: { type: Date, default: Date.now }
        });
        SessionModel = mongoose.models.Session || mongoose.model("Session", schema);
      } catch (e) {
        console.warn("⚠️ SessionModel creation failed:", e.message);
      }
    }).catch(err => console.error("❌ MongoDB error:", err.message));
} else {
  console.warn("⚠️ MONGO_URI not set — DB persistence disabled. Sessions will be memory-only.");
}

// ---------- In-memory sessions ----------
const sessions = {}; // { userId: { lastMenu, meta, updatedAt } }

async function upsertSession(userId, patch = {}) {
  const now = new Date();
  const existing = sessions[userId] || {};
  const newObj = Object.assign({}, existing, patch, { updatedAt: now, userId });
  sessions[userId] = newObj;

  if (SessionModel) {
    try {
      await SessionModel.updateOne({ userId }, { $set: newObj }, { upsert: true });
    } catch (e) {
      console.warn("⚠️ session upsert mongo error:", e.message);
    }
  }
  return newObj;
}

async function loadSession(userId) {
  if (sessions[userId]) return sessions[userId];
  if (SessionModel) {
    try {
      const doc = await SessionModel.findOne({ userId }).lean();
      if (doc) {
        sessions[userId] = doc;
        return doc;
      }
    } catch (e) {
      console.warn("⚠️ session load error:", e.message);
    }
  }
  const def = { userId, lastMenu: "main", meta: {}, updatedAt: new Date() };
  sessions[userId] = def;
  if (SessionModel) {
    try { await SessionModel.updateOne({ userId }, { $set: def }, { upsert: true }); } catch {}
  }
  return def;
}

// TTL cleanup if configured
if (parseInt(SESSION_TTL_MIN) > 0) {
  const ttlMs = parseInt(SESSION_TTL_MIN) * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [uid, s] of Object.entries(sessions)) {
      if (!s.updatedAt) continue;
      if (now - new Date(s.updatedAt).getTime() > ttlMs) {
        delete sessions[uid];
        if (SessionModel) SessionModel.deleteOne({ userId: uid }).catch(()=>{});
        console.log("🗑️ Session TTL expired for", uid);
      }
    }
  }, Math.max(60000, Math.floor((parseInt(SESSION_TTL_MIN) * 60 * 1000) / 2)));
}

// ---------- simple health route ----------
app.get("/ping", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.json({ status: "ok", ts: Date.now() }));

// ---------- signature verify (optional) ----------
const crypto = require("crypto");
function verifySignature(req) {
  if (!APP_SECRET) return true;
  try {
    const sig = req.headers['x-hub-signature-256'];
    if (!sig) return false;
    const hmac = crypto.createHmac('sha256', APP_SECRET);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig));
  } catch (e) {
    console.warn("⚠️ signature verify failed:", e.message);
    return false;
  }
}

// ---------- webhook verification GET ----------
app.get("/webhooks/whatsapp/cloudapi", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  console.log("🔔 Webhook verify attempt", { mode, tokenProvided: !!token, ts: Date.now() });
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }
  console.warn("❌ Webhook verification failed");
  return res.sendStatus(403);
});

// ---------- webhook POST receiver ----------
app.post("/webhooks/whatsapp/cloudapi", async (req, res) => {
  // verify signature (optional)
  if (!verifySignature(req)) {
    console.warn("⚠️ Invalid signature - rejecting");
    return res.sendStatus(403);
  }

  // ACK fast
  res.status(200).send("EVENT_RECEIVED");

  try {
    const body = req.body;
    console.log("📥 Incoming webhook body keys:", Object.keys(body || {}));
    // defensive extraction - WhatsApp sends entry->changes->value
    const entry = Array.isArray(body.entry) ? body.entry[0] : body.entry || {};
    const changes = entry?.changes?.[0] || {};
    const value = changes?.value || entry?.value || body;
    const messages = Array.isArray(value?.messages) ? value.messages : (value?.messages ? [value.messages] : []);
    const statuses = Array.isArray(value?.statuses) ? value.statuses : (value?.statuses ? [value.statuses] : []);

    // ignore statuses (delivery/read) by default
    if (statuses && statuses.length > 0) {
      console.log("ℹ️ Status event(s) received — ignoring:", statuses.length);
      return;
    }

    const message = messages[0];
    if (!message) {
      console.log("ℹ️ No message payload — ignoring");
      return;
    }

    // ignore echoes or messages without 'from'
    if (!message.from) {
      console.log("ℹ️ Message missing 'from' — ignoring:", message);
      return;
    }
    if (message.from === WA_PHONE_ID) {
      console.log("ℹ️ Ignoring messages from our own WA_PHONE_ID");
      return;
    }

    // load session
    const from = message.from;
    const session = await loadSession(from);

    // interactive reply (button/list)
    if (message.type === "interactive") {
      const interactive = message.interactive || {};
      const reply = interactive?.button_reply || interactive?.list_reply || null;
      const payloadId = reply?.id || reply?.title || interactive?.type || null;
      console.log("🖱️ Interactive reply ->", payloadId, "from", from);
      // delegate to central handler (pass upsertSession so handler can persist)
      await handleButtonClick(from, String(payloadId || ""), session, upsertSession);
      await upsertSession(from, { lastMenu: sessions[from]?.lastMenu || session.lastMenu || "main" });
      return;
    }

    // text -> always send main menu (per requirement)
    if (message.type === "text") {
      console.log("✉️ Text from", from, "- sending MAIN menu");
      await upsertSession(from, { lastMenu: "main" });
      await sendMessage.sendMenu(from, "main");
      return;
    }

    // media/sticker/etc -> fallback to main menu
    console.log("⚠️ Unhandled type:", message.type, "- fallback to MAIN menu for", from);
    await upsertSession(from, { lastMenu: "main" });
    await sendMessage.sendMenu(from, "main");
    return;

  } catch (err) {
    console.error("❌ Webhook handler error:", err && err.stack ? err.stack : err);
  }
});

// ---------- Keep-alive self-pinger (jittered) ----------
if (BASE_URL) {
  const interval = Math.max(60000, parseInt(KEEPALIVE_INTERVAL_MS) || 300000); // at least 60s
  const jitterMax = Math.min(60000, Math.floor(interval * 0.3));
  (async () => {
    // warmup ping
    try {
      await axios.get(`${BASE_URL}/ping`, { timeout: 5000 });
      console.log("🔥 Warmup ping OK");
    } catch (e) {
      console.warn("⚠️ Warmup ping failed:", e.message);
    }
  })();
  setInterval(() => {
    const jitter = Math.floor(Math.random() * jitterMax);
    setTimeout(async () => {
      try {
        await axios.get(`${BASE_URL}/ping`, { timeout: 8000 });
        console.log("🔄 Keep-alive ping sent");
      } catch (e) {
        console.warn("⚠️ Keep-alive ping failed:", e.message);
      }
    }, jitter);
  }, interval);
} else {
  console.warn("⚠️ BASE_URL not set — keep-alive disabled. Set BASE_URL to your Render URL.");
}

// ---------- start server ----------
const port = parseInt(PORT) || 5555;
app.listen(port, () => console.log(`🚀 KAAPAV Bot running on port ${port}`));
