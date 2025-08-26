// File: utils/buttonHandler.js
// Central router for button IDs & free text (stateless; index passes session + upsertSession)
const translate = require('./translate');
const sendMessage = require('./sendMessage');
const logger = console;

let io = null;
function setSocket(socketInstance) {
  io = socketInstance;
  try {
    console.log('buttonHandler.setSocket called.');
  } catch (_) {}
}

// ID map: normalize various variants to canonical actions
const idMap = {
  // Main
  'jewellery_categories': 'JEWELLERY_MENU',
  'offers_more': 'OFFERS_MENU',
  'chat_with_us': 'CHAT_MENU',

  // Back actions
  'back_main_menu': 'MAIN_MENU',
  'back_offers': 'OFFERS_MENU',
  'back_offers_menu': 'OFFERS_MENU',

  // Payment & orders
  'payment_orders': 'PAYMENT_MENU',
  'pay_via_upi': 'PAY_UPI',
  'pay_via_card': 'PAY_CARD',
  'track_order': 'TRACK_ORDER',

  // Offers
  'current_offers': 'OFFERS_NOW',
  'shop_now': 'SHOP_NOW',

  // Jewellery deep links
  'open_website_browse': 'OPEN_WEBSITE',
  'open_wa_catalog': 'OPEN_CATALOG',

  // Support
  'connect_agent': 'CONNECT_AGENT'
};

// Free-text keyword routing (keep titles ≤20 chars in menus to avoid WA trim)
const keywords = [
  { re: /\b(jewell?ery|browse|catalog(?:ue)?)\b/i, action: 'JEWELLERY_MENU' },
  { re: /\b(offer|discount|deal|sale)\b/i, action: 'OFFERS_MENU' },
  { re: /\b(pay(?:ment)?|razorpay|upi|card|netbanking)\b/i, action: 'PAYMENT_MENU' },
  { re: /\b(track(?:ing)?|order\s*status|where.*order)\b/i, action: 'TRACK_ORDER' },
  { re: /\b(chat|help|support|agent)\b/i, action: 'CHAT_MENU' },
  { re: /\b(back|main menu|menu|start|hi|hello|hey|namaste)\b/i, action: 'MAIN_MENU' }
];

function normalizeId(s) {
  const key = String(s || '').trim();
  if (!key) return '';
  const lower = key.toLowerCase();
  if (idMap[lower]) return idMap[lower];
  const up = key.toUpperCase();
  if (idMap[up]) return idMap[up];
  return '';
}

async function routeAction(action, from, session, upsertSession) {
  if (io) try { io.emit('route_action', { from, action, session, ts: Date.now() }); } catch (_) {}

  switch (action) {
    case 'MAIN_MENU':
      await sendMessage.sendMainMenu(from, session);
      await upsertSession(from, { lastMenu: 'main', meta: { greetingSent: true }, lang: session?.lang });
      return true;

    case 'JEWELLERY_MENU':
      await sendMessage.sendJewelleryCategoriesMenu(from, session);
      await upsertSession(from, { lastMenu: 'jewellery_categories', lang: session?.lang });
      return true;

    case 'OFFERS_MENU':
      await sendMessage.sendOffersAndMoreMenu(from, session);
      await upsertSession(from, { lastMenu: 'offers', lang: session?.lang });
      return true;

    case 'PAYMENT_MENU':
      await sendMessage.sendPaymentOrdersMenu(from, session);
      await upsertSession(from, { lastMenu: 'payment', lang: session?.lang });
      return true;

    case 'OFFERS_NOW':
      await sendMessage.sendOffersAndMoreMenu(from, session);
      await upsertSession(from, { lastMenu: 'offers_current', lang: session?.lang });
      return true;

    case 'SHOP_NOW':
      await sendMessage.sendText(from, '🛒 Opening shop link...');
      await sendMessage.sendOffersAndMoreMenu(from, session);
      return true;

    case 'OPEN_WEBSITE':
      await sendMessage.sendWebsiteCta(from, session);
      return true;

    case 'OPEN_CATALOG':
      await sendMessage.sendWhatsappCatalogCta(from, session);
      return true;

    case 'PAY_UPI':
      await sendMessage.sendText(from, '💳 UPI Payment Link coming up…');
      await sendMessage.sendPaymentOrdersMenu(from, session);
      return true;

    case 'PAY_CARD':
      await sendMessage.sendText(from, '💳 Card/Netbanking link coming up…');
      await sendMessage.sendPaymentOrdersMenu(from, session);
      return true;

    case 'TRACK_ORDER':
      await sendMessage.sendTrackOrderCta(from, session);
      await upsertSession(from, { lastMenu: 'payment', lang: session?.lang });
      return true;

    case 'CHAT_MENU':
      await sendMessage.sendChatWithUsCta(from, session);
      await upsertSession(from, { lastMenu: 'chat', lang: session?.lang });
      return true;

    case 'CONNECT_AGENT':
      await sendMessage.sendConnectAgentText(from, session);
      return true;

    default:
      return false;
  }
}

async function handleIncomingWebhook(body) {
  try {
    logger.log("📩 Incoming webhook:", JSON.stringify(body));

    const change = body?.entry?.[0]?.changes?.[0];
    const msg = change?.value?.messages?.[0];
    const from = msg?.from;
    if (!msg || !from) return false;

    if (msg.type === "text") {
      logger.log(`💬 Message from ${from}: ${msg.text?.body}`);
    }
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      logger.log(`🔘 Button click from ${from}: ${msg.interactive.button_reply.id}`);
    }

    if (msg.type === 'interactive') {
      const reply = msg.interactive?.button_reply || msg.interactive?.list_reply || {};
      const raw = reply?.id || reply?.title || reply?.row_id || '';
      const action = normalizeId(raw);
      if (!action) return false;
      await routeAction(action, from, {}, async () => {});
      if (io) try { io.emit('button_pressed', { from, id: raw, ts: Date.now() }); } catch (_) {}
      return true;
    }

    if (msg.type === 'text') {
      const original = msg.text?.body || '';
      let translated = original;
      let detectedLang = 'en';

      try {
        const t = await translate.toEnglish(original);
        translated = t?.translated || translated;
        detectedLang = t?.detectedLang || detectedLang;
      } catch (_) {}

      let action = 'MAIN_MENU';
      for (const k of keywords) {
        if (k.re.test(translated)) {
          action = k.action;
          break;
        }
      }

      if (io) try { io.emit('text_routed', { from, original, translated, detectedLang, action, ts: Date.now() }); } catch (_) {}

      await routeAction(action, from, { lang: detectedLang }, async () => {});
      return true;
    }

    return false;
  } catch (e) {
    console.warn('buttonHandler.handleIncomingWebhook error:', e.message);
    return false;
  }
}


async function handleButtonClick(from, payload, session = {}, upsertSession = async () => {}) {
  if (!from) return false;
  const raw = String(payload || '').trim();

  const idAction = normalizeId(raw);
  if (idAction) {
    return routeAction(idAction, from, session, upsertSession);
  }

  for (const k of keywords) {
    if (k.re.test(raw)) {
      return routeAction(k.action, from, session, upsertSession);
    }
  }

  return routeAction('MAIN_MENU', from, session, upsertSession);
}

module.exports = {
  handleButtonClick,
  handleIncomingWebhook,
  setSocket,
};
