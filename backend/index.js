// File: index.js
// KAAPAV WhatsApp Bot (10/10)
// Webhook + sessions (Mongo optional) + menu routing
// Socket.IO admin chat + message history
// Google Sheets + CRM/n8n + GitHub logging + keepalive (Render)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const http = require('http');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const { Server } = require('socket.io');
// utils
const sendMessage = require('./utils/sendMessage');
const { handleButtonClick, setSocket } = require('./utils/buttonHandler');

// ====== ENV ======
const PORT = process.env.PORT || 5555;
const {
  VERIFY_TOKEN,
  MONGO_URI,
  WA_PHONE_ID, // WhatsApp phone_number_id
  ADMIN_TOKEN,

  // Optional integrations
  SHEETS_ENABLED,            // "1" to enable
  GOOGLE_PROJECT_ID,         // (unused but kept for completeness)
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY,        // replace \n with real newlines
  GOOGLE_SHEET_ID,
  GOOGLE_SHEET_TAB = 'Leads',

  CRM_WEBHOOK_URL,
  N8N_WEBHOOK_URL,

  GITHUB_TOKEN,
  GITHUB_REPO,               // "owner/repo"
  GITHUB_LOG_ISSUES = '0',

  KEEPALIVE_INTERVAL_MS = 300000,
  RENDER_EXTERNAL_URL,       // e.g., https://your-app.onrender.com

  // basic anti-spam
  DUPLICATE_WINDOW_MS = 20000
} = process.env;

const app = express();
app.use(bodyParser.json({ limit: '2mb' }));
app.use(cors());

/**
 * ✅ 1. Redirect middleware
 * This runs BEFORE routes.
 * If user hits kaapav.is-a.dev, redirect to www.kaapav.is-a.dev
 */
app.use((req, res, next) => {
  if (req.hostname === 'kaapav.is-a.dev') {
    return res.redirect(301, 'https://www.kaapav.is-a.dev' + req.url);
  }
  next();
});

/**
 * ✅ 2. Routes
 */
app.get('/', (req, res) => {
  res.send('KAAPAV App is live! 🚀');
});

/**
 * ✅ 3. Catch-all 404
 * This must come last — after all other routes.
 */
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// ====== HTTP + Socket.IO ======
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// attach socket to buttonHandler (no redundant re-require)
try {
  if (typeof setSocket === 'function') {
    setSocket(io);
    console.log('✅ Socket wired to buttonHandler via setSocket(io)');
  } else {
    console.error('❌ setSocket is not a function on buttonHandler export');
  }
} catch (err) {
  console.error('❌ Error while calling setSocket:', err && err.stack ? err.stack : err);
}

// ====== Mongo Models (optional but recommended) ======
let SessionModel = null;
let MessageModel = null;

async function initMongo() {
  if (!MONGO_URI) {
    console.warn('⚠️ MONGO_URI not set — DB persistence disabled.');
    return;
  }
  try {
    await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB || undefined });
    console.log('✅ MongoDB connected');

    const sessionSchema = new mongoose.Schema({
      userId: { type: String, index: true, unique: true },
      lastMenu: { type: String, default: 'main' },
      meta: {
        greetingSent: { type: Boolean, default: false },
        name: String,
        phone: String,
        email: String,
        orderId: String,
        attributes: Object
      },
      counters: {
        interactions: { type: Number, default: 0 }
      },
      lastTenMessages: { type: [String], default: [] },
      updatedAt: { type: Date, default: Date.now }
    });
    SessionModel = mongoose.models.Session || mongoose.model('Session', sessionSchema);

    const messageSchema = new mongoose.Schema({
      userId: { type: String, index: true },
      direction: { type: String, enum: ['in', 'out'], default: 'in' },
      type: String,
      text: String,
      payload: Object,
      createdAt: { type: Date, default: Date.now },
      messageId: { type: String, index: true } // for idempotency
    });
    MessageModel = mongoose.models.Message || mongoose.model('Message', messageSchema);
  } catch (e) {
    console.error('❌ Mongo init error:', e.message);
  }
}
initMongo();

// ====== In-memory session & idempotency fallback ======
const sessions = {};
const processedMessageIds = new Map(); // messageId -> timestamp

function isDuplicateMessage(messageId) {
  if (!messageId) return false;
  const now = Date.now();
  const last = processedMessageIds.get(messageId);
  if (last && now - last < Number(DUPLICATE_WINDOW_MS || 20000)) return true;
  processedMessageIds.set(messageId, now);
  if (processedMessageIds.size > 5000) {
    for (const [k, v] of processedMessageIds) {
      if (now - v > 5 * 60 * 1000) processedMessageIds.delete(k);
    }
  }
  return false;
}

async function upsertSession(userId, patch = {}) {
  const now = new Date();
  const existing = sessions[userId] || {};
  const mergedMeta = { ...(existing.meta || {}), ...(patch.meta || {}) };
  const mergedCounters = { ...(existing.counters || {}), ...(patch.counters || {}) };
  const lastTenMessages = patch.lastTenMessages || existing.lastTenMessages || [];
  const newObj = {
    ...existing,
    ...patch,
    meta: mergedMeta,
    counters: mergedCounters,
    lastTenMessages,
    updatedAt: now,
    userId
  };
  sessions[userId] = newObj;

  if (SessionModel) {
    try {
      await SessionModel.updateOne({ userId }, { $set: newObj }, { upsert: true });
    } catch (e) {
      console.warn('⚠️ session upsert mongo error:', e.message);
    }
  }

  try { io.to('admin').emit('session_update', newObj); } catch {}
  return newObj;
}

async function loadSession(userId) {
  if (!userId) return null;
  if (sessions[userId]) return sessions[userId];
  if (SessionModel) {
    try {
      const doc = await SessionModel.findOne({ userId }).lean();
      if (doc) { sessions[userId] = doc; return doc; }
    } catch (e) { console.warn('⚠️ session load error:', e.message); }
  }
  const def = {
    userId,
    lastMenu: 'main',
    meta: { greetingSent: false, phone: userId },
    counters: { interactions: 0 },
    lastTenMessages: [],
    updatedAt: new Date()
  };
  sessions[userId] = def;
  if (SessionModel) {
    try { await SessionModel.updateOne({ userId }, { $set: def }, { upsert: true }); } catch {}
  }
  try { io.to('admin').emit('session_update', def); } catch {}
  return def;
}

async function saveMessage(userId, direction, type, text, payload, messageId) {
  try {
    const obj = {
      userId,
      direction,
      type: type || 'text',
      text: text || '',
      payload: payload || null,
      createdAt: new Date(),
      messageId
    };
    if (MessageModel) {
      if (messageId) {
        const exists = await MessageModel.findOne({ messageId }).lean();
        if (!exists) await MessageModel.create(obj);
      } else {
        await MessageModel.create(obj);
      }
    }
    try { io.to('admin').emit('message_saved', obj); } catch {}
  } catch (e) {
    console.warn('⚠️ saveMessage error', e.message);
  }
}

// ====== Optional Integrations (Sheets / CRM / n8n / GitHub) ======
let sheetsClient = null;
async function initSheets() {
  try {
    if (SHEETS_ENABLED !== '1') return;
    if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
      console.warn('⚠️ Sheets env incomplete — skipping Google Sheets init.');
      return;
    }
    const { google } = require('googleapis');
    const jwt = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: (GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    await jwt.authorize();
    sheetsClient = google.sheets({ version: 'v4', auth: jwt });
    console.log('✅ Google Sheets client ready');
  } catch (e) {
    console.warn('⚠️ Sheets init failed:', e.message);
  }
}
initSheets();

async function appendToSheets(row) {
  if (!sheetsClient) return;
  try {
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${GOOGLE_SHEET_TAB}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });
  } catch (e) {
    console.warn('⚠️ Sheets append failed:', e.message);
  }
}

async function postWebhook(url, payload) {
  if (!url) return;
  try { await axios.post(url, payload, { timeout: 15000 }); }
  catch (e) { console.warn(`⚠️ webhook POST failed (${url}):`, e.message); }
}

async function logGithubIssue(title, body) {
  try {
    if (GITHUB_LOG_ISSUES !== '1' || !GITHUB_TOKEN || !GITHUB_REPO) return;
    await axios.post(
      `https://api.github.com/repos/${GITHUB_REPO}/issues`,
      { title, body },
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json' } }
    );
  } catch (e) {
    console.warn('⚠️ GitHub issue log failed:', e.message);
  }
}

// ====== Socket.IO admin real-time handlers ======
io.on('connection', async (socket) => {
  try {
    const clientToken = socket.handshake.auth?.token || (socket.handshake.headers?.authorization || '').split(' ')[1];
    if (ADMIN_TOKEN && clientToken !== ADMIN_TOKEN) {
      socket.emit('admin_error', { error: 'unauthorized' });
      socket.disconnect(true);
      return;
    }

    socket.join('admin');

    try {
      if (SessionModel) {
        const docs = await SessionModel.find().sort({ updatedAt: -1 }).limit(200).lean();
        socket.emit('sessions_snapshot', docs);
      } else {
        socket.emit('sessions_snapshot', Object.values(sessions).sort((a,b)=> (a.updatedAt < b.updatedAt ? 1 : -1)));
      }
    } catch (e) {
      socket.emit('admin_error', { error: 'failed_fetch_sessions', details: e.message });
    }

    socket.on('fetch_session_messages', async (userId) => {
      if (!userId) return socket.emit('session_messages', []);
      try {
        if (MessageModel) {
          const msgs = await MessageModel.find({ userId }).sort({ createdAt: -1 }).limit(200).lean();
          socket.emit('session_messages', msgs);
        } else {
          socket.emit('session_messages', []);
        }
      } catch (e) {
        socket.emit('admin_error', { error: 'fetch_messages_failed', details: e.message });
      }
    });

    socket.on('admin_send_message', async ({ to, text }) => {
      if (!to || !text) return socket.emit('admin_send_error', { error: 'missing_to_or_text' });
      try {
        await sendMessage.sendText(to, text);
        await saveMessage(to, 'out', 'text', text, null);
        io.to('admin').emit('outgoing_message', { to, type: 'text', text, ts: Date.now(), direction: 'out' });
      } catch (e) {
        socket.emit('admin_send_error', { error: e.message || String(e) });
      }
    });

    socket.on('admin_send_buttons', async (payload) => {
      const { to, bodyText, buttons, footerText } = payload || {};
      if (!to || !Array.isArray(buttons)) return socket.emit('admin_send_error', { error: 'invalid_buttons_payload' });
      try {
        if (typeof sendMessage.sendReplyButtons !== 'function') {
          return socket.emit('admin_send_error', { error: 'sendReplyButtons not available in sendMessage' });
        }
        await sendMessage.sendReplyButtons(to, bodyText || '', buttons.slice(0,3), footerText);
        await saveMessage(to, 'out', 'interactive', bodyText || '', { buttons });
        io.to('admin').emit('outgoing_message', { to, type: 'interactive', payload: { bodyText, buttons }, ts: Date.now(), direction: 'out' });
      } catch (e) {
        socket.emit('admin_send_error', { error: e.message || String(e) });
      }
    });

  } catch (outerErr) {
    try { socket.emit('admin_error', { error: outerErr.message || String(outerErr) }); } catch {}
    socket.disconnect(true);
  }
});

// ====== Helpers for menu actions ======
const MENU_ACTIONS = {
  sendMainMenu1: async (to) => { await sendMessage.sendMainMenu(to); await upsertSession(to, { lastMenu: 'main' }); },
  sendMainMenu2: async (to) => { await sendMessage.sendMainMenu(to); await upsertSession(to, { lastMenu: 'main' }); },
  sendJewelleryCategoriesMenu: async (to) => { await sendMessage.sendJewelleryCategoriesMenu(to); await upsertSession(to, { lastMenu: 'jewellery_categories' }); },
  sendOffersMenu: async (to) => { await sendMessage.sendOffersAndMoreMenu(to); await upsertSession(to, { lastMenu: 'offers' }); },
  sendPaymentMenu: async (to) => { await sendMessage.sendPaymentOrdersMenu(to); await upsertSession(to, { lastMenu: 'payment' }); },
  sendChatMenu: async (to) => { await sendMessage.sendChatWithUsCta(to); await upsertSession(to, { lastMenu: 'chat' }); }
};

// ====== Text processing ======
function normalizeText(s) {
  return (s || '').trim();
}

async function processText(from, text, session, messageId) {
  const raw = normalizeText(text);
  await saveMessage(from, 'in', 'text', raw, { raw }, messageId);

  // track lastTenMessages & counters
  const lastTen = (session.lastTenMessages || []).slice(-9).concat(raw);
  await upsertSession(from, {
    counters: { interactions: (session.counters?.interactions || 0) + 1 },
    lastTenMessages: lastTen
  });

  // capture lead hints
  const emailMatch = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const phoneMatch = raw.match(/(?:\+?\d{1,3})?[ -]?\d{10,13}/);
  const nameHint = raw.toLowerCase().startsWith('my name is ') ? raw.slice(11).trim().split(/\s+/).slice(0,3).join(' ') : null;
  if (emailMatch || phoneMatch || nameHint) {
    await upsertSession(from, {
      meta: {
        ...(emailMatch ? { email: emailMatch[0] } : {}),
        ...(phoneMatch ? { phone: phoneMatch[0] } : {}),
        ...(nameHint ? { name: nameHint } : {})
      }
    });
  }

  // GOOGLE SHEETS + CRM/N8N + GitHub logging (async)
  const sheetRow = [
    new Date().toISOString(),
    from,
    raw,
    session.lastMenu || 'main',
    session.meta?.name || '',
    session.meta?.email || '',
    session.meta?.phone || from
  ];
  appendToSheets(sheetRow).catch(()=>{});
  const payload = { userId: from, text: raw, lastMenu: session.lastMenu, meta: session.meta, counters: session.counters };
  postWebhook(CRM_WEBHOOK_URL, payload).catch(()=>{});
  postWebhook(N8N_WEBHOOK_URL, payload).catch(()=>{});
  logGithubIssue(`[Inbound] ${from}`, `**Text:** ${raw}\n**LastMenu:** ${session.lastMenu}\n**At:** ${new Date().toISOString()}`).catch(()=>{});

  // greeting flow
  if (!session.meta?.greetingSent || /^menu$/i.test(raw)) {
    await MENU_ACTIONS.sendMainMenu1(from);
    await upsertSession(from, { meta: { greetingSent: true }, lastMenu: 'main' });
    return;
  }

  // route via button handler
  try {
    const handled = await handleButtonClick(from, raw, session, upsertSession);
    if (handled) return;
  } catch (e) {
    console.warn('⚠️ buttonHandler threw on text:', e.message);
  }

  // keyword fallback
  const lowered = raw.toLowerCase();
  if (/(jewell?ery|browse|catalog)/.test(lowered)) return MENU_ACTIONS.sendJewelleryCategoriesMenu(from);
  if (/(offer|discount)/.test(lowered)) return MENU_ACTIONS.sendOffersMenu(from);
  if (/(pay|payment|razor)/.test(lowered)) return MENU_ACTIONS.sendPaymentMenu(from);
  if (/(track|order)/.test(lowered)) {
    if (typeof sendMessage.sendTrackOrderCta === 'function') await sendMessage.sendTrackOrderCta(from);
    else await sendMessage.sendText(from, 'Track your order: https://www.shiprocket.in/shipment-tracking/');
    return;
  }
  if (/(chat|help|support|agent)/.test(lowered)) return MENU_ACTIONS.sendChatMenu(from);

  // default
  await MENU_ACTIONS.sendMainMenu1(from);
}

// ====== Interactive processing ======
async function processInteractive(from, rawReply, session, messageId) {
  const normalized = String(rawReply || '').trim();
  if (!normalized) return;

  await saveMessage(from, 'in', 'interactive', normalized, { raw: rawReply }, messageId);

  try {
    const handled = await handleButtonClick(from, normalized, session, upsertSession);
    if (!handled) await sendMessage.sendMainMenu(from);
  } catch (e) {
    console.error('❌ handleButtonClick error:', e.message || e);
    await sendMessage.sendMainMenu(from);
  }

  try { io.to('admin').emit('button_pressed', { from, id: normalized, ts: Date.now() }); } catch {}
}

// ====== Webhook endpoints ======
app.get('/webhooks/whatsapp/cloudapi', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }
  res.sendStatus(400);
});

app.post('/webhooks/whatsapp/cloudapi', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED');
  try {
    const body = req.body || {};
    const entry = Array.isArray(body.entry) ? body.entry[0] : body.entry;
    const change = entry?.changes?.[0];
    const value = change?.value || {};
    const messages = value?.messages || [];
    const statuses = value?.statuses || [];

    // ignore status events (delivered/read)
    if (!messages.length && statuses.length) return;

    const message = messages[0];
    if (!message) return;

    const from = message.from;
    const msgId = message.id;
    if (!from) return;

    // ❌ Removed echo-skip that was dropping all inbound messages
    // Inbound events always carry your WA phone_number_id in metadata, so never skip by that.

    // Idempotency guard
    if (isDuplicateMessage(msgId)) {
      console.log(`⏭️ duplicate message skipped: ${msgId}`);
      return;
    }

    const session = await loadSession(from);

    // emit incoming for admin
    try {
      io.to('admin').emit('incoming_message', {
        from,
        message: { type: message.type, text: message.text?.body || null, interactive: message.interactive || null },
        ts: Date.now()
      });
    } catch {}

    if (message.type === 'interactive') {
      const reply = message.interactive?.button_reply || message.interactive?.list_reply || {};
      const rawId = (reply?.id || reply?.title || reply?.row_id || '').toString().trim();
      if (!rawId) return;
      await processInteractive(from, rawId, session, msgId);
      return;
    }

    if (message.type === 'text') {
      const txt = message.text?.body || '';
      await processText(from, txt, session, msgId);
      return;
    }

    // other media types — acknowledge politely
    if (message.type) {
      await saveMessage(from, 'in', message.type, null, { raw: message }, msgId);
      await sendMessage.sendText(from, 'Thanks — we received your message. Reply "menu" to see options.');
    }
  } catch (err) {
    console.error('❌ Webhook processing error:', err?.response?.data || err.message || err);
  }
});

// ====== Admin endpoints ======
function requireAdminToken(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const h = req.headers.authorization || '';
  const token = (h.split(' ')[1] || '').trim();
  if (!token || token !== ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  return next();
}

app.post('/admin/send', requireAdminToken, async (req, res) => {
  const { to, action } = req.body || {};
  if (!to || !action) return res.status(400).send('Missing to or action');
  const fn = MENU_ACTIONS[action];
  if (!fn) return res.status(400).send('Unknown action');
  try {
    await fn(to);
    return res.json({ ok: true });
  } catch (e) {
    console.error('❌ admin/send error:', e);
    return res.status(500).send(e.message || 'error');
  }
});

app.post('/admin/simulate', requireAdminToken, async (req, res) => {
  const { to, text } = req.body || {};
  if (!to || !text) return res.status(400).send('Missing to or text');
  try { io.to('admin').emit('incoming_message', { from: to, message: { type: 'text', text }, ts: Date.now() }); } catch {}
  const session = await loadSession(to);
  try {
    const handled = await handleButtonClick(to, text, session, upsertSession);
    if (!handled) await MENU_ACTIONS.sendMainMenu1(to);
  } catch (e) {
    console.error('❌ simulate handling error:', e.message || e);
  }
  return res.json({ ok: true });
});

app.post('/admin/raw', requireAdminToken, async (req, res) => {
  const { to, payload } = req.body || {};
  if (!to || !payload) return res.status(400).send('Missing to or payload');
  if (typeof sendMessage.sendAPIRequest === 'function') {
    try {
      await sendMessage.sendAPIRequest({ ...payload, to });
      try { io.to('admin').emit('outgoing_message', { to, action: 'raw', payload, ts: Date.now() }); } catch {}
      return res.json({ ok: true });
    } catch (e) {
      console.error('❌ raw send error:', e);
      return res.status(500).send(e.message || 'error');
    }
  }
  return res.status(400).send('sendAPIRequest not exposed');
});

// serve static dashboard if built into public/dashboard
app.use('/dashboard', express.static(path.join(process.cwd(), 'public', 'dashboard')));

// quick test endpoint
app.post('/test/sendMain', async (req, res) => {
  try {
    const to = req.body?.to;
    if (!to) return res.status(400).send('Missing "to"');
    await MENU_ACTIONS.sendMainMenu1(to);
    return res.status(200).send('Main menu sent');
  } catch (e) {
    console.error('❌ test sendMain error:', e);
    return res.status(500).send('Error sending main');
  }
});

// self-check endpoint (simple diagnostics)
app.get('/test/selfcheck', async (req, res) => {
  const checks = {
    env: {
      PORT,
      VERIFY_TOKEN: !!VERIFY_TOKEN,
      MONGO_URI: !!MONGO_URI,
      WA_PHONE_ID: !!WA_PHONE_ID,
      ADMIN_TOKEN: !!ADMIN_TOKEN,
      SHEETS_ENABLED: !!SHEETS_ENABLED,
      GOOGLE_SHEET_ID: !!GOOGLE_SHEET_ID
    },
    sendMessageExports: Object.keys(sendMessage || {}).slice(0, 50),
    hasButtonHandler: typeof handleButtonClick === 'function',
    mongoConnected: !!SessionModel && !!MessageModel
  };
  res.json(checks);
});
// start server + keepalive
// Health & keepalive routes
app.get("/", (req, res) => {
  res.send("✅ Kaapav WhatsApp Worker is alive!");
});

app.get("/test/selfcheck", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "alive",
    timestamp: Date.now()
  });
});

// Start server
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });

// Keepalive ping (to prevent Render idling)
setInterval(async () => {
  console.log("🔄 Keepalive ping...");
  if (RENDER_EXTERNAL_URL) {
    try {
      await axios.get(`${RENDER_EXTERNAL_URL}/test/selfcheck`, { timeout: 10000 });
    } catch (err) {
      console.warn("Keepalive ping failed:", err.message || err);
    }
  }
}, Number(KEEPALIVE_INTERVAL_MS || 300000)); // default 5 min

