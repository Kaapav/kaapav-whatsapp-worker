// utils/sendMessage.js
// KAAPAV WhatsApp bot — WhatsApp Cloud API sender utilities
// Compatible with index.js + buttonHandler.js
// Optional telemetry to n8n / Google Sheets (env-gated)

const axios = require('axios');
require('dotenv').config();
const { fromEnglish } = require('./translate.js');

async function sendLocalizedText(to, text, lang = 'en') {
  const localized = await fromEnglish(text, lang);
  return sendText(to, localized);
}

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WA_PHONE_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v17.0';
const API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

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

// ======== Deep links (update with final URLs) ========
const LINKS = {
  website: 'https://www.kaapav.com',
  whatsappCatalog: 'https://wa.me/c/919148330016',
  waMeChat: 'https://wa.me/919148330016',
  offersBestsellers: 'https://www.kaapav.com/shop/category/all-jewellery-12?category=12&search=&order=&tags=16',
  upi: 'upi://pay?pa=your-upi@upi&pn=KAAPAV',        // replace with real UPI deep link
  card: 'https://kaapav.com/pay/card',               // replace with real hosted link
  razorpay: 'https://kaapav.com/pay/razorpay',       // optional hosted checkout
  shiprocket: 'https://www.shiprocket.in/shipment-tracking/',
  googleReview: 'https://g.page/YOUR-GOOGLE-REVIEW-LINK', // optional
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
    console.warn('[sendMessage] n8n post failed:', e.message);
  }
}

// ======== Core sender ========
async function sendAPIRequest(payload) {
  try {
    const res = await axios.post(API_URL, payload, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    try {
      if (ioInstance) ioInstance.to('admin').emit('outgoing_message', { payload, ts: Date.now() });
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
  const payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
  return sendAPIRequest(payload);
}

// reply buttons (WhatsApp supports up to 3 quick reply buttons)
async function sendReplyButtons(to, bodyText, buttons /* [{id,title}] max 3 */, footer) {
  if (!buttons || !buttons.length) return sendText(to, bodyText);
  if (buttons.length > 3) buttons = buttons.slice(0, 3);
  const waButtons = buttons.map((b) => ({
    type: 'reply',
    reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) },
  }));

  const payload = {
    messaging_product: 'whatsapp',
    to,
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
  await sendText(to, `${bodyText}\n${displayText}: ${url}`);
  const payload = {
    messaging_product: 'whatsapp',
    to,
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
  const body = await fromEnglish(
    "✨ Welcome to *KAAPAV Fashion Jewellery*! ✨\n\n👑 Luxury you’ll love, crafted to shine 💎\nHow can we assist you today?",
    lang
  );

  const footer = await fromEnglish(
    "Choose an option below 👇\n🛍️ Explore Elegance, Exclusively with KAAPAV.",
    lang
  );

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: [
          { type: "reply", reply: { id: "JEWELLERY_MENU", title: await fromEnglish("💎 Jewellery", lang) } },
          { type: "reply", reply: { id: "OFFERS_MENU", title: await fromEnglish("🎉 Offers", lang) } },
          { type: "reply", reply: { id: "PAYMENT_MENU", title: await fromEnglish("💳 Payment", lang) } },
        ],
      },
    },
  };
  return sendAPIRequest(payload);
}

// Alt main menu (you can customize later)
async function sendMainMenuAlt(to, lang = "en") {
  return sendText(
    to,
    "✨ KAAPAV Alt Menu ✨\nThis is a placeholder menu. Full version coming soon!"
  );
}

// Simple info (basic text sender for fallback commands)
async function sendSimpleInfo(to, text, lang = "en") {
  const localized = await fromEnglish(text, lang);
  return sendText(to, localized);
}
// ======== JEWELLERY MENU ========
async function sendJewelleryCategoriesMenu(to, lang = 'en') {
  const body = await fromEnglish(
    "💎 *Explore the World of KAAPAV Elegance* 💎\n\n✨ Carefully handcrafted, designed to shine ✨\n👑 Jewellery that defines luxury & grace.",
    lang
  );

  const footer = await fromEnglish(
    "KAAPAV Elegance ✨ Visit our site for more",
    lang
  );

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: [
          { type: "reply", reply: { id: "OPEN_WEBSITE", title: await fromEnglish("🌐 Website", lang) } },
          { type: "reply", reply: { id: "OPEN_CATALOG", title: await fromEnglish("📱 Catalogue", lang) } },
          { type: "reply", reply: { id: "MAIN_MENU", title: await fromEnglish("⬅️ Home", lang) } },
        ],
      },
    },
  };
  return sendAPIRequest(payload);
}

// ======== OFFERS MENU ========
async function sendOffersAndMoreMenu(to, lang = 'en') {
  const body = await fromEnglish(
    "💫 *Exclusive Offers Just for You!* 💫\n\n🎉 Luxury jewellery at *Flat 50% OFF* ✨\n🚚 Free Shipping above ₹499 💝",
    lang
  );

  const footer = await fromEnglish(
    "KAAPAV Offers ✨ Luxury made affordable",
    lang
  );

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: [
          { type: "reply", reply: { id: "PAYMENT_MENU", title: await fromEnglish("💳 Payment", lang) } },
          { type: "reply", reply: { id: "TRACK_ORDER", title: await fromEnglish("📦 Track Order", lang) } },
          { type: "reply", reply: { id: "MAIN_MENU", title: await fromEnglish("⬅️ Home", lang) } },
        ],
      },
    },
  };
  return sendAPIRequest(payload);
}
// ======== PAYMENT MENU ========
async function sendPaymentOrdersMenu(to, lang = 'en') {
  const body = await fromEnglish(
    "💳 *Proceed to Payment – KAAPAV Jewellery* 💳\n\n✨ Complete your sparkle with a secure checkout ✨\n\n1️⃣ UPI: " + LINKS.upi +
    "\n2️⃣ Card/Netbanking: " + LINKS.card +
    "\n3️⃣ Razorpay: " + LINKS.razorpay +
    "\n\n🚫 Cash on Delivery not available.",
    lang
  );

  const footer = await fromEnglish(
    "💖 Thank you for choosing KAAPAV ✨",
    lang
  );

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: [
          { type: "reply", reply: { id: "PAY_UPI", title: await fromEnglish("💳 UPI", lang) } },
          { type: "reply", reply: { id: "PAY_CARD", title: await fromEnglish("🏦 Card", lang) } },
          { type: "reply", reply: { id: "MAIN_MENU", title: await fromEnglish("⬅️ Home", lang) } },
        ],
      },
    },
  };
  return sendAPIRequest(payload);
}


// ======== TRACK ORDER MENU ========
async function sendTrackOrderCta(to, lang = 'en') {
  const body = await fromEnglish(
    "📦 *Track Your Order – KAAPAV Jewellery* 📦\n\n✨ Stay updated on your sparkle’s journey ✨🚚",
    lang
  );

  const footer = await fromEnglish(
    "Track orders easily ✨ We’re here to help",
    lang
  );

  return sendReplyButtons(
    to,
    body,
    [{ id: "MAIN_MENU", title: await fromEnglish("⬅️ Home", lang) } ],
    footer
  );
}

// ======== CHAT MENU ========
async function sendChatWithUsCta(to, lang = 'en') {
  const body = await fromEnglish(
    "💬 *Need Help? We’re Here for You!* 💬\n\nPlease describe your query below ⬇️\nOur support team will assist you with luxury care 💖👑",
    lang
  );

  const footer = await fromEnglish("We are just a tap away ✨", lang);

  return sendReplyButtons(
    to,
    body,
    [
      { id: "CHAT_NOW", title: await fromEnglish("💬 Chat Now", lang) },
      { id: "MAIN_MENU", title: await fromEnglish("⬅️ Home", lang) },
    ],
    footer
  );
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
  sendMainMenuAlt,
  sendJewelleryCategoriesMenu,
  sendOffersAndMoreMenu,
  sendPaymentOrdersMenu,

  // CTAs
  sendTrackOrderCta,
  sendChatWithUsCta,

  // extra for routing
  //sendProductList,
  sendSimpleInfo,
  LINKS,
};
