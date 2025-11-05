// utils/sendMessage.js
// KAAPAV WhatsApp bot — WhatsApp Cloud API sender utilities
// Compatible with index.js + buttonHandler.js
// Optional telemetry to n8n / Google Sheets (env-gated)

const axios = require('axios');
require('dotenv-expand').expand(require('dotenv').config());
const { fromEnglish } = require('./translate.js');

// Normalize Indian numbers into WhatsApp format (91XXXXXXXXXX)
function normalizeIN(phone) {
  if (!phone) return '';
  const digits = phone.toString().replace(/\D/g, '');
  if (digits.startsWith('91')) return digits;
  if (digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

async function sendLocalizedText(to, text, lang = 'en') {
  const localized = await fromEnglish(text, lang);
  return sendText(to, localized);
}

const WA_PHONE_ID = (process.env.WA_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const WA_TOKEN = (process.env.WHATSAPP_ACCESS_TOKEN || process.env.WA_ACCESS_TOKEN || process.env.WA_TOKEN || '').trim();
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v17.0';
const API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WA_PHONE_ID}/messages`;
// Back-compat (ensures any legacy code reading process.env sees values)
process.env.WHATSAPP_ACCESS_TOKEN     = WA_TOKEN;
process.env.WA_ACCESS_TOKEN           = WA_TOKEN;
process.env.WA_PHONE_ID               = WA_PHONE_ID;
process.env.WHATSAPP_PHONE_NUMBER_ID = WA_PHONE_ID;

// optional diagnostics
if (!WA_TOKEN)    console.warn('[sendMessage] ⚠️ WA_TOKEN missing');
if (!WA_PHONE_ID) console.warn('[sendMessage] ⚠️ WA_PHONE_ID missing');
else              console.log(`[sendMessage] ✅ CloudAPI wired → phoneId ${WA_PHONE_ID}`);

// Optional integrations (internal, safe to leave empty)
const SHEETS_ENABLED = process.env.SHEETS_ENABLED === '1';
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SHEET_TAB = process.env.GOOGLE_SHEET_TAB || 'WhatsAppLogs';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

let ioInstance = null;
function setSocket(io) {
  ioInstance = io;
}

// ======== Deep links (final URLs) ========
const LINKS = {
  website: "https://www.kaapav.com",
  whatsappCatalog: "https://wa.me/c/919148330016",
  waMeChat: "https://wa.me/919148330016",
  offersBestsellers: "https://www.kaapav.com/shop/category/all-jewellery-12?category=12&search=&order=&tags=16",
  payment: "https://razorpay.me/@kaapav",    // Razorpay payment link
  shiprocket: "https://www.shiprocket.in/shipment-tracking/",
  googleReview: "https://g.page/YOUR-GOOGLE-REVIEW-LINK", // optional
  facebook: "https://www.facebook.com/kaapavfashionjewellery/",
  instagram: "https://www.instagram.com/kaapavfashionjewellery/",
};

// ======== Optional telemetry ========
let sheetsClient = null;
async function _initSheetsIfNeeded() {
  if (!(SHEETS_ENABLED && GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY && GOOGLE_SHEET_ID)) return;
  if (sheetsClient) return;
  try {
    const { google } = require('googleapis');
    const jwt = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    await jwt.authorize();
    sheetsClient = google.sheets({ version: 'v4', auth: jwt });
  } catch (e) {
    console.warn('[sendMessage] Sheets init failed:', e.message);
  }
}
async function _appendToSheets(values) {
  try {
    await _initSheetsIfNeeded();
    if (!sheetsClient) return;
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${GOOGLE_SHEET_TAB}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] },
    });
  } catch (e) {
    console.warn('[sendMessage] Sheets append failed:', e.message);
  }
}
async function _postToN8n(event, payload) {
  if (!N8N_WEBHOOK_URL) return;
  try {
    await axios.post(N8N_WEBHOOK_URL, { event, payload, ts: Date.now() }, { timeout: 15000 });
  } catch (e) {
    console.warn('[sendMessage] n8n post failed (ignored):', e.message);
  }
}

// ======== Core sender ========
async function sendAPIRequest(payload) {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    const meta = { tokenLen: (WA_TOKEN || '').length, phoneId: WA_PHONE_ID };
    throw new Error(`wa_config_missing:${JSON.stringify(meta)}`);
  }
  try {
    const res = await axios.post(API_URL, payload, {
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    try {
      if (ioInstance) ioInstance.to('admins').emit('outgoing_message', { payload, ts: Date.now() });
      _appendToSheets([
        new Date().toISOString(),
        'OUT',
        payload?.to || '',
        payload?.type || '',
        JSON.stringify(payload).slice(0, 500),
      ]).catch(() => {});
      _postToN8n('wa_outgoing', payload).catch(() => {});
    } catch {}

    return res.data;
  } catch (err) {
    console.error('WhatsApp API error:', err?.response?.data || err.message || err);
    throw err;
  }
}

async function sendText(to, text) {
  const payload = { messaging_product: 'whatsapp', to: normalizeIN(to), type: 'text', text: { body: text } };
  return sendAPIRequest(payload);
}

// reply buttons (WhatsApp supports up to 3 quick reply buttons)
async function sendReplyButtons(to, bodyText, buttons /* [{id,title}] max 3 */, footer) {
  const normalizedTo = normalizeIN(to); 
  if (!buttons || !buttons.length) return sendText(normalizedTo, bodyText);
  if (buttons.length > 3) buttons = buttons.slice(0, 3);
  const waButtons = buttons.map((b) => ({
    type: 'reply',
    reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) },
  }));

  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      footer: { text: footer || "Choose below 👇" },
      action: { buttons: waButtons },
    },
  };
  if (footer) payload.interactive.footer = { text: footer };
  return sendAPIRequest(payload);
}

// CTA url interactive (send text first to ensure a tappable URL)
async function sendCtaUrl(to, bodyText, displayText, url, footer) {
  const normalizedTo = normalizeIN(to);
  await sendText(normalizedTo, `${bodyText}\n${displayText}: ${url}`);
  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: `OPEN_URL_${Math.random().toString(36).slice(2, 8)}`, title: displayText.slice(0, 20) },
          },
        ],
      },
    },
  };
  if (footer) payload.interactive.footer = { text: footer };
  try {
    return await sendAPIRequest(payload);
  } catch {
    // best-effort: text already sent
    return { ok: true, note: 'interactive_fallback_to_text' };
  }
}

async function sendTextWithLinks(to, text) {
  return sendText(to, text);
}

// ======== Menus & CTAs (IDs synced with buttonHandler.js) ========
// ======== MAIN MENU ========
async function sendMainMenu(to, lang = 'en') {
  const normalizedTo = normalizeIN(to);
  const body = await fromEnglish(
    "✨ Welcome to *KAAPAV Luxury Jewellery*! ✨\n\n👑 Crafted Elegance • Timeless Sparkle 💎\nChoose an option below 👇",
    lang
  );

  const footer = await fromEnglish("💖 Luxury Meets You, Only at KAAPAV", lang);

  const payload = {
    messaging_product: "whatsapp",
    to: normalizedTo,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: [
          { type: "reply", reply: { id: "JEWELLERY_MENU", title: await fromEnglish("💎 Jewellery", lang) } },
          { type: "reply", reply: { id: "CHAT_MENU", title: await fromEnglish("💬 Chat with Us!", lang) } },
          { type: "reply", reply: { id: "OFFERS_MENU", title: await fromEnglish("🎉 Offers & More", lang) } },
        ],
      },
    },
  };
  return sendAPIRequest(payload);
}

// Simple info (basic text sender for fallback commands)
async function sendSimpleInfo(to, text, lang = "en") {
  const localized = await fromEnglish(text, lang);
  return sendText(to, localized);
}


// ======== JEWELLERY MENU ========
async function sendJewelleryCategoriesMenu(to, lang = 'en') {
  const normalizedTo = normalizeIN(to);
  const body = await fromEnglish(
    "💎 *Explore KAAPAV Collections* 💎\n\n✨ Handcrafted designs, curated for royalty 👑",
    lang
  );

  const footer = await fromEnglish("🌐 kaapav.com | 📱 Catalogue", lang);

  const payload = {
    messaging_product: "whatsapp",
    to: normalizedTo,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: [
          { type: "reply", reply: { id: "OPEN_WEBSITE", title: await fromEnglish("🌐 Website", lang) } },
          { type: "reply", reply: { id: "OPEN_CATALOG", title: await fromEnglish("📱 Catalogue", lang) } },
          { type: "reply", reply: { id: "MAIN_MENU", title: await fromEnglish("🏰 Home", lang) } },
        ],
      },
    },
  };
  return sendAPIRequest(payload);
}

// ======== OFFERS MENU ========
async function sendOffersAndMoreMenu(to, lang = 'en') {
  const normalizedTo = normalizeIN(to);
  const body = await fromEnglish(
    "💫 *Exclusive Luxury Offers!* 💫\n\n🎉 Flat 50% OFF Select Styles ✨\n🚚 Free Shipping Above ₹498/- 💝",
    lang
  );

  const footer = await fromEnglish("🛍️ KAAPAV Bestsellers", lang);

  const payload = {
    messaging_product: "whatsapp",
    to: normalizedTo,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: [
          { type: "reply", reply: { id: "BESTSELLERS", title: await fromEnglish("🛍️ Bestsellers", lang) } },
          { type: "reply", reply: { id: "PAYMENT_MENU", title: await fromEnglish("💳 Payment & Track", lang) } },
          { type: "reply", reply: { id: "MAIN_MENU", title: await fromEnglish("🏰 Home", lang) } },
        ],
      },
    },
  };
  return sendAPIRequest(payload);
}

// ======== PAYMENT & TRACK MENU ========
async function sendPaymentAndTrackMenu(to, lang = 'en') {
  const normalizedTo = normalizeIN(to);
  const body = await fromEnglish(
    "💎 *Complete Your Sparkle with KAAPAV* 💎\n\n" +
    "Choose a secure option:\n" +
    "1️⃣ 💳 Payment – UPI or Cards\n" +
    "2️⃣ 📦 Track Your Order – Shiprocket\n\n" +
    "🚫 No COD ❌",
    lang
  );

  const footer = await fromEnglish("👑 KAAPAV – Luxury, Seamless & Secure ✨", lang);

  const payload = {
    messaging_product: "whatsapp",
    to: normalizedTo,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: [
          { type: "reply", reply: { id: "PAY_NOW", title: await fromEnglish("💳 Payment", lang) } },
          { type: "reply", reply: { id: "TRACK_ORDER", title: await fromEnglish("📦 Track Order", lang) } },
          { type: "reply", reply: { id: "MAIN_MENU", title: await fromEnglish("🏰 Home", lang) } },
        ],
      },
    },
  };
  return sendAPIRequest(payload);
}

// ======== CHAT MENU ========
async function sendChatWithUsCta(to, lang = 'en') {
  const normalizedTo = normalizeIN(to);
  const body = await fromEnglish(
    "💬 *Need Help? We’re Here for You!* 💬\n\nPlease describe your query below ⬇️\nOur support team will assist you with luxury care 👑✨",
    lang
  );

  const footer = await fromEnglish("We are just a tap away 💖", lang);

  const payload = {
    messaging_product: "whatsapp",
    to: normalizedTo,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CHAT_NOW", title: await fromEnglish("💬 Chat Now", lang) } },
          { type: "reply", reply: { id: "SOCIAL_MENU", title: await fromEnglish("🌐 FB & Instagram", lang) } },
          { type: "reply", reply: { id: "MAIN_MENU", title: await fromEnglish("🏠 Home", lang) } },
        ],
      },
    },
  };
  return sendAPIRequest(payload);
}

// ======== CHAT SUBMENU (FB & Insta) ========
async function sendSocialMenu(to, lang = 'en') {
  const normalizedTo = normalizeIN(to);
  const body = await fromEnglish(
    "🌐 *Follow KAAPAV on Social Media* 🌐\n\nStay connected for luxury vibes 👑✨",
    lang
  );

  const footer = await fromEnglish("📲 Choose your platform below 👇", lang);

  const payload = {
    messaging_product: "whatsapp",
    to: normalizedTo,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: [
          { type: "reply", reply: { id: "OPEN_FACEBOOK", title: await fromEnglish("📘 Facebook", lang) } },
          { type: "reply", reply: { id: "OPEN_INSTAGRAM", title: await fromEnglish("📸 Instagram", lang) } },
          { type: "reply", reply: { id: "MAIN_MENU", title: await fromEnglish("🏠 Home", lang) } },
        ],
      },
    },
  };
  return sendAPIRequest(payload);
}

module.exports = {
  // low-level
  sendAPIRequest,
  sendText,
  sendReplyButtons,
  sendCtaUrl,
  sendTextWithLinks,
  setSocket,

  // menus
  sendMainMenu,
  sendJewelleryCategoriesMenu,
  sendOffersAndMoreMenu,
  sendPaymentAndTrackMenu,

  // CTAs
  sendChatWithUsCta,
  sendSocialMenu,

  // extra for routing
  //sendProductList,
  sendSimpleInfo,
  LINKS,
};
