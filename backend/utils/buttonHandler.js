// utils/buttonHandler.js
// Central router for button IDs & free text
// Compatible with index.js + sendMessage.js
// Optional translate + telemetry (io emits)

require('dotenv').config();
const sendMessage = require('./sendMessage');
const { toEnglish } = require('./translate');


let ioInstance = null;
function setSocket(io) {
  ioInstance = io;
}

// Optional translation adapter (safe fallback)
let translate = { toEnglish: async (s) => ({ translated: s, detectedLang: 'en' }) };
try {
  translate = require('./translate'); // provide your own module if available
} catch {}

// ID map: normalize various variants to canonical actions (align with sendMessage)
// Add/extend in idMap:
const idMap = {
  // Main + Back
  'main_menu': 'MAIN_MENU',
  'back_main': 'MAIN_MENU',
  'back_main_menu': 'MAIN_MENU',
  'back': 'MAIN_MENU',

  // Top-level
  'jewellery_menu': 'JEWELLERY_MENU',
  'offers_menu': 'OFFERS_MENU',
  'payment_menu': 'PAYMENT_MENU',
  'chat_menu': 'CHAT_MENU',

  // Submenu link buttons
  'open_website': 'OPEN_WEBSITE',
  'open_catalog': 'OPEN_CATALOG',
  'open_bestsellers': 'OPEN_BESTSELLERS',

  // Payments
  'pay_upi': 'PAY_UPI',
  'pay_card': 'PAY_CARD',
  'pay_razorpay': 'PAY_RAZORPAY',

  // Tracking & support
  'track_order': 'TRACK_ORDER',
  'chat_now': 'CHAT_NOW',

  // Listing (optional)
  'show_list': 'SHOW_LIST',
};


// Add/extend in keywords (first match wins)
const keywords = [
  // Menus
  { re: /\b(browse|shop|website|site)\b/i, action: "JEWELLERY_MENU" },
  { re: /\b(offer|discount|deal|sale)\b/i, action: "OFFERS_MENU" },
  { re: /\b(pay(?:ment)?|razorpay|upi|card|netbanking)\b/i, action: "PAYMENT_MENU" },
  { re: /\b(chat|help|support|agent)\b/i, action: "CHAT_MENU" },
  { re: /\b(back|main menu|menu|start|hi|hello|hey|namaste)\b/i, action: "MAIN_MENU" },

  // Direct actions
  { re: /\b(best(?:seller)?s?|trending|top picks?)\b/i, action: "OPEN_BESTSELLERS" },
  { re: /\b(list|categories|category list|full list)\b/i, action: "SHOW_LIST" },
  { re: /\b(website|shop now)\b/i, action: "OPEN_WEBSITE" },
  { re: /\b(catalog|catalogue|whatsapp catalog)\b/i, action: "OPEN_CATALOG" },
  { re: /\b(upi|gpay|google pay|phonepe|paytm)\b/i, action: "PAY_UPI" },
  { re: /\b(card|netbanking|debit|credit)\b/i, action: "PAY_CARD" },
  { re: /\b(razorpay)\b/i, action: "PAY_RAZORPAY" },
  { re: /\b(track|tracking|order status|where.*order)\b/i, action: "TRACK_ORDER" },
  { re: /\b(chat now|talk|connect)\b/i, action: "CHAT_NOW" },
];



function normalizeId(s) {
  const key = String(s || '').trim().toLowerCase();
  if (!key) return '';
  const lower = key.toLowerCase();
  if (idMap[lower]) return idMap[lower];
  const upper = lower.replace(/[^a-z0-9_]/g, ''); // normalize
  if (idMap[upper]) return idMap[upper];
  return '';
}

async function routeAction(action, from, session, upsertSession = async () => {}) {
  try {
    if (ioInstance) ioInstance.emit("route_action", { from, action, session, ts: Date.now() });

    switch (action) {
      // ---- Main Menus ----
      case "MAIN_MENU":
        await sendMessage.sendMainMenu(from, session);
        await upsertSession(from, { lastMenu: "main" });
        return true;

      case "JEWELLERY_MENU":
        await sendMessage.sendJewelleryCategoriesMenu(from, session);
        await upsertSession(from, { lastMenu: "jewellery" });
        return true;

      case "OFFERS_MENU":
        await sendMessage.sendOffersAndMoreMenu(from, session);
        await upsertSession(from, { lastMenu: "offers" });
        return true;

      case "PAYMENT_MENU":
        await sendMessage.sendPaymentOrdersMenu(from, session);
        await upsertSession(from, { lastMenu: "payment" });
        return true;

      case "CHAT_MENU":
        await sendMessage.sendChatWithUsCta(from, session);
        await upsertSession(from, { lastMenu: "chat" });
        return true;

      // ---- Submenu Link Actions (Jugaad) ----
      case "OPEN_WEBSITE":
        await sendMessage.sendSimpleInfo(from, `🌐 Browse on website:\n${sendMessage.LINKS.website}`);
        return true;
        
      // Add these in routeAction switch:
      case "OPEN_BESTSELLERS":
        await sendMessage.sendSimpleInfo(from, `🛍️ Shop Bestsellers:\n${sendMessage.LINKS.offersBestsellers}`);
        return true;

        case "SHOW_LIST":
        await sendMessage.sendProductList(from);
        return true;
  
      case "OPEN_CATALOG":
        await sendMessage.sendSimpleInfo(from, `📱 WhatsApp Catalogue:\n${sendMessage.LINKS.whatsappCatalog}`);
        return true;

      case "PAY_UPI":
        await sendMessage.sendSimpleInfo(from, `💳 Pay via UPI:\n${sendMessage.LINKS.upi}`);
        return true;

      case "PAY_CARD":
        await sendMessage.sendSimpleInfo(from, `🏦 Pay via Card/Netbanking:\n${sendMessage.LINKS.card}`);
        return true;

      case "PAY_RAZORPAY":
        await sendMessage.sendSimpleInfo(from, `🔗 Pay via Razorpay:\n${sendMessage.LINKS.razorpay}`);
        return true;

      case "TRACK_ORDER":
        await sendMessage.sendSimpleInfo(from, `📦 Track your order here:\n${sendMessage.LINKS.shiprocket}`);
        return true;

      case "CHAT_NOW":
        await sendMessage.sendSimpleInfo(from, `💬 Chat with us:\n${sendMessage.LINKS.waMeChat}`);
        return true;

      default:
        return false;
    }
  } catch (e) {
    console.warn("[buttonHandler] routeAction error:", e.message);
    return false;
  }
}



// Legacy-like webhook entry (stateless). index.js calls its own webhook; this is provided for reuse if needed.
async function handleIncomingWebhook(body, upsertSession = async () => {}) {
  try {
    const change = body?.entry?.[0]?.changes?.[0];
    const msg = change?.value?.messages?.[0];
    const from = msg?.from;
    if (!msg || !from) return false;

    // --- Interactive button flow ---
    if (msg.type === 'interactive') {
      const reply = msg.interactive?.button_reply || msg.interactive?.list_reply || {};
      const raw = reply?.id || reply?.title || reply?.row_id || '';
      const action = normalizeId(raw);
      if (!action) return false;

      await routeAction(action, from, { lang: 'en' }, upsertSession); // default lang English
      if (ioInstance) ioInstance.emit('button_pressed', { from, id: raw, ts: Date.now() });
      return true;
    }

    // --- Free text flow ---
    if (msg.type === 'text') {
      const original = msg.text?.body || '';
      let translated = original;
      let detectedLang = 'en';

      try {
        const t = await translate.toEnglish(original);
        translated = t?.translated || translated;
        detectedLang = t?.detectedLang || 'en';
      } catch {
        // translation errors shouldn't break routing
      }

      // Decide action from keywords (first match wins)
      let action = 'MAIN_MENU';
      for (const k of keywords) {
        if (k.re.test(translated)) {
          action = k.action;
          break;
        }
      }

      // Save lang in session for future messages
      await upsertSession(from, { lang: detectedLang });

      if (ioInstance) {
        ioInstance.emit('text_routed', { 
          from, 
          original, 
          translated, 
          detectedLang, 
          action, 
          ts: Date.now() 
        });
      }

      await routeAction(action, from, { lang: detectedLang }, upsertSession);
      return true;
    }

    return false;
  } catch (e) {
    console.warn('[buttonHandler] handleIncomingWebhook error:', e.message);
    return false;
  }
}

// Free-text or button click entry (called by frontend / socket)
async function handleButtonClick(from, payload, session = {}, upsertSession = async () => {}) {
  if (!from) return false;
  const raw = String(payload || '').trim();

  // Normalize button ID → action
  const action = normalizeId(raw);
  if (action) return routeAction(action, from, session, upsertSession);

  // Keyword fallback
  for (const k of keywords) {
    if (k.re.test(raw)) return routeAction(k.action, from, session, upsertSession);
  }

  // Default fallback
  return routeAction('MAIN_MENU', from, session, upsertSession);
}

module.exports = {
  handleButtonClick,
  handleIncomingWebhook,
  routeAction,  
  setSocket,
};
