// utils/buttonHandler.js
// KAAPAV — Incoming Router (buttons + free text)
// Pairs with utils/sendMessage.js (menus & LINKS) and index.js webhook.
// Goals: robust normalize → route → reply. No crashes, no dupes, smooth UX.

require('dotenv-expand').expand(require('dotenv').config());

const sendMessage = require('./sendMessage'); // exposes: sendText, menus, sendSimpleInfo, LINKS
let translate = { toEnglish: async (s) => ({ translated: s, detectedLang: 'en' }) };
try { translate = require('./translate'); } catch {} // optional module

// ----- Socket wiring -----
let ioInstance = null;
function setSocket(io) { ioInstance = io; }

// ===== JUGAAD GUARDS =====
// 1) De-dup incoming WA messages (Meta may retry)
const seenIds = new Set();
function dedupe(waId) {
  if (!waId) return true; // keep unknowns
  if (seenIds.has(waId)) return false;
  seenIds.add(waId);
  if (seenIds.size > 5000) { // cap memory
    const arr = Array.from(seenIds);
    seenIds.clear();
    for (let i = arr.length - 2500; i < arr.length; i++) if (i >= 0) seenIds.add(arr[i]);
  }
  return true;
}

// 2) Per-user rate control to avoid flooding (buttons/text loops)
const lastSend = new Map(); // userId -> ts
const RL_MS = Number(process.env.ROUTER_THROTTLE_MS || 900); // safe default <1s
function allowedToSend(userId) {
  const now = Date.now();
  const last = lastSend.get(userId) || 0;
  if (now - last < RL_MS) return false;
  lastSend.set(userId, now);
  return true;
}

// 3) Session in-memory patch helper (index.js can pass its own)
async function defaultUpsertSession(userId, patch) { /* no-op for embedded usage */ }

// ===== Canonical ID map (normalize noisy inputs → single action) =====
const idMap = {
  // main/back
  'main_menu': 'MAIN_MENU',
  'back': 'MAIN_MENU',
  'back_main': 'MAIN_MENU',
  'back_main_menu': 'MAIN_MENU',
  'home': 'MAIN_MENU',
  'start': 'MAIN_MENU',

  // top-level menus
  'jewellery_menu': 'JEWELLERY_MENU',
  'offers_menu': 'OFFERS_MENU',
  'payment_menu': 'PAYMENT_MENU',
  'chat_menu': 'CHAT_MENU',
  'social_menu': 'SOCIAL_MENU',

  // submenu links / actions
  'open_website': 'OPEN_WEBSITE',
  'open_catalog': 'OPEN_CATALOG',
  'open_bestsellers': 'OPEN_BESTSELLERS',
  'pay_now': 'PAY_NOW',
  'track_order': 'TRACK_ORDER',
  'chat_now': 'CHAT_NOW',
  'open_facebook': 'OPEN_FACEBOOK',
  'open_instagram': 'OPEN_INSTAGRAM',

  // optional informational
  'show_list': 'SHOW_LIST',
};

// ===== Keyword → action routing (first match wins) =====
const keywords = [
  // menus
  { re: /\b(browse|shop|website|site|collection|categories?)\b/i, action: 'JEWELLERY_MENU' },
  { re: /\b(offer|discount|deal|sale|bestsellers?)\b/i, action: 'OFFERS_MENU' },
  { re: /\b(payment|pay|upi|card|netbanking|debit|credit|payment\s*menu)\b/i, action: 'PAYMENT_MENU' },
  { re: /\b(chat|help|support|agent|talk|assist)\b/i, action: 'CHAT_MENU' },
  { re: /\b(back|main menu|menu|start|hi|hello|hey|namaste|vanakkam)\b/i, action: 'MAIN_MENU' },

  // direct CTAs
  { re: /\b(best(?:seller)?s?|trending|top\s*picks?)\b/i, action: 'OPEN_BESTSELLERS' },
  { re: /\b(list|category\s*list|full\s*list)\b/i, action: 'SHOW_LIST' },
  { re: /\b(website|shop\s*now)\b/i, action: 'OPEN_WEBSITE' },
  { re: /\b(catalog|catalogue|whatsapp\s*catalog)\b/i, action: 'OPEN_CATALOG' },
  { re: /\b(track|tracking|order\s*status|where\s*.*order)\b/i, action: 'TRACK_ORDER' },

  // socials
  { re: /\b(facebook|fb)\b/i, action: 'OPEN_FACEBOOK' },
  { re: /\b(insta|instagram)\b/i, action: 'OPEN_INSTAGRAM' },
  { re: /\b(social|follow|media)\b/i, action: 'SOCIAL_MENU' },
];

// ===== Utilities =====
function normalizeId(s) {
  const key = String(s || '').trim().toLowerCase();
  if (!key) return '';
  if (idMap[key]) return idMap[key];
  const alnum = key.replace(/[^a-z0-9_]/g, '');
  if (idMap[alnum]) return idMap[alnum];
  return '';
}

function pickLang(session) {
  return (session && session.lang) ? session.lang : 'en';
}

function emit(ev, payload) {
  try { ioInstance?.emit(ev, payload); } catch {}
}

// ===== Core router (one action → one send) =====
async function routeAction(action, from, session, upsertSession = defaultUpsertSession) {
  const lang = pickLang(session);
  emit('route_action', { from, action, lang, ts: Date.now() });

  switch (action) {
    // Menus
    case 'MAIN_MENU':
      await sendMessage.sendMainMenu(from, lang);
      await upsertSession(from, { lastMenu: 'main' });
      return true;

    case 'JEWELLERY_MENU':
      await sendMessage.sendJewelleryCategoriesMenu(from, lang);
      await upsertSession(from, { lastMenu: 'jewellery' });
      return true;

    case 'OFFERS_MENU':
      await sendMessage.sendOffersAndMoreMenu(from, lang);
      await upsertSession(from, { lastMenu: 'offers' });
      return true;

    case 'PAYMENT_MENU':
      await sendMessage.sendPaymentAndTrackMenu(from, lang);
      await upsertSession(from, { lastMenu: 'payment_track' });
      return true;

    case 'CHAT_MENU':
      await sendMessage.sendChatWithUsCta(from, lang);
      await upsertSession(from, { lastMenu: 'chat' });
      return true;

    case 'SOCIAL_MENU':
      await sendMessage.sendSocialMenu(from, lang);
      await upsertSession(from, { lastMenu: 'social' });
      return true;

    // CTAs / Links
    case 'OPEN_WEBSITE':
      await sendMessage.sendSimpleInfo(from, `🌐 Browse our website:\n${sendMessage.LINKS.website}`, lang);
      return true;

    case 'OPEN_CATALOG':
      await sendMessage.sendSimpleInfo(from, `📱 WhatsApp Catalogue:\n${sendMessage.LINKS.whatsappCatalog}`, lang);
      return true;

    case 'OPEN_BESTSELLERS':
      await sendMessage.sendSimpleInfo(from, `🛍️ Shop Bestsellers:\n${sendMessage.LINKS.offersBestsellers}`, lang);
      return true;

    case 'PAY_NOW':
      await sendMessage.sendSimpleInfo(from, `💳 Pay via UPI/Card/Netbanking:\n${sendMessage.LINKS.payment}`, lang);
      return true;

    case 'TRACK_ORDER':
      await sendMessage.sendSimpleInfo(from, `📦 Track your order:\n${sendMessage.LINKS.shiprocket}`, lang);
      return true;

    case 'CHAT_NOW':
      await sendMessage.sendSimpleInfo(from, `💬 Chat with us:\n${sendMessage.LINKS.waMeChat}`, lang);
      return true;

    case 'OPEN_FACEBOOK':
      await sendMessage.sendSimpleInfo(from, `📘 Facebook:\n${sendMessage.LINKS.facebook}`, lang);
      return true;

    case 'OPEN_INSTAGRAM':
      await sendMessage.sendSimpleInfo(from, `📸 Instagram:\n${sendMessage.LINKS.instagram}`, lang);
      return true;

    // Info fallback
    case 'SHOW_LIST':
      await sendMessage.sendSimpleInfo(from, `📜 Categories coming soon.\nMeanwhile explore:\n${sendMessage.LINKS.website}`, lang);
      return true;

    default:
      return false;
  }
}

// ===== Webhook handler (called by index.js) =====
async function handleIncomingWebhook(body, upsertSession = defaultUpsertSession) {
  try {
    const change = body?.entry?.[0]?.changes?.[0];
    const v = change?.value || {};
    const msgs = v.messages || [];
    if (!msgs.length) return false;

    for (const m of msgs) {
      const waId = m.id || '';
      if (!dedupe(waId)) continue;

      const from = String(m.from || '');
      const type = m.type;

      // --- Socket typing hint (UX sugar) ---
      emit('user_typing', { from, ts: Date.now() });

      // --- Interactive ---
      if (type === 'interactive') {
        const reply = m.interactive?.button_reply || m.interactive?.list_reply || {};
        const raw = reply?.id || reply?.title || reply?.row_id || '';
        const action = normalizeId(raw);
        if (!action) continue;

        // Rate-limit protection
        if (allowedToSend(from)) {
          await routeAction(action, from, { lang: 'en' }, upsertSession);
        } else {
          // soft drop; avoid loops
          emit('router_skip_rl', { from, action, ts: Date.now() });
        }

        emit('button_pressed', { from, id: raw, action, ts: Date.now() });
        continue;
      }

      // --- Plain text ---
      if (type === 'text') {
        const original = m.text?.body || '';
        let translated = original;
        let detectedLang = 'en';
        try {
          const t = await translate.toEnglish(original);
          translated = t?.translated || translated;
          detectedLang = t?.detectedLang || 'en';
        } catch {}

        // store language for future
        await upsertSession(from, { lang: detectedLang });

        // Keyword route (first match)
        let action = 'MAIN_MENU';
        for (const k of keywords) {
          if (k.re.test(translated)) { action = k.action; break; }
        }

        // Rate-limit protection
        if (allowedToSend(from)) {
          await routeAction(action, from, { lang: detectedLang }, upsertSession);
        } else {
          emit('router_skip_rl', { from, action, ts: Date.now() });
        }

        emit('text_routed', { from, original, translated, detectedLang, action, ts: Date.now() });
        continue;
      }

      // --- Media stubs (optional) ---
      if (type === 'image' || type === 'audio' || type === 'video' || type === 'document' || type === 'sticker') {
        // Minimal polite reply; avoid 24h policy traps
        if (allowedToSend(from)) {
          await sendMessage.sendSimpleInfo(from, '✅ Received. Our team will respond shortly.', 'en');
        }
        emit('media_received', { from, type, ts: Date.now() });
        continue;
      }
    }

    return true;
  } catch (e) {
    console.warn('[buttonHandler] handleIncomingWebhook error:', e.message);
    return false;
  }
}

// ===== Frontend/socket entry (admins trigger routes) =====
async function handleButtonClick(from, payload, session = {}, upsertSession = defaultUpsertSession) {
  if (!from) return false;
  const raw = String(payload || '').trim();

  // Normalize button ID
  const action = normalizeId(raw);
  if (action) return routeAction(action, from, session, upsertSession);

  // Keyword fallback
  for (const k of keywords) {
    if (k.re.test(raw)) return routeAction(k.action, from, session, upsertSession);
  }

  // Default
  return routeAction('MAIN_MENU', from, session, upsertSession);
}

module.exports = {
  handleButtonClick,
  handleIncomingWebhook,
  routeAction,
  setSocket,
};
