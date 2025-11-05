// utils/buttonHandler.js
// KAAPAV — Incoming Router (buttons + free text)
// Pairs with utils/sendMessage.js (menus & LINKS) and index.js webhook.
// Goals: robust normalize → route → reply. No crashes, no dupes, smooth UX.

require('dotenv-expand').expand(require('dotenv').config());

const sendMessage = require('./sendMessage');
let translate = { toEnglish: async (s) => ({ translated: s, detectedLang: 'en' }) };
try { translate = require('./translate'); } catch {}

// ----- Socket wiring -----
let ioInstance = null;
function setSocket(io) { ioInstance = io; }

// ===== JUGAAD GUARDS =====
// 1) De-dup incoming WA messages (Meta may retry)
const seenIds = new Set();
function dedupe(waId) {
  if (!waId) return true;
  if (seenIds.has(waId)) return false;
  seenIds.add(waId);
  if (seenIds.size > 5000) {
    const arr = Array.from(seenIds);
    seenIds.clear();
    for (let i = arr.length - 2500; i < arr.length; i++) if (i >= 0) seenIds.add(arr[i]);
  }
  return true;
}

// 2) Per-user rate control to avoid flooding
const lastSend = new Map();
const RL_MS = Number(process.env.ROUTER_THROTTLE_MS || 900);
function allowedToSend(userId) {
  const now = Date.now();
  const last = lastSend.get(userId) || 0;
  if (now - last < RL_MS) return false;
  lastSend.set(userId, now);
  return true;
}

// ===== NEW: Message Queue for Sequential Processing =====
const messageQueue = new Map(); // userId -> Promise

async function queuedRoute(from, action, session, upsertSession) {
  const existing = messageQueue.get(from);
  const task = async () => {
    if (existing) await existing; // Wait for previous message
    return routeAction(action, from, session, upsertSession);
  };
  const promise = task();
  messageQueue.set(from, promise);
  
  // Cleanup after completion
  promise.finally(() => {
    if (messageQueue.get(from) === promise) {
      messageQueue.delete(from);
    }
  });
  
  return promise;
}

// ===== NEW: Timeout Wrapper =====
const withTimeout = (promise, ms = 5000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), ms)
    )
  ]);
};

/*// ===== NEW: Rate Limit Feedback Helper =====
async function handleRateLimitedUser(from, action) {
  emit('router_skip_rl', { from, action, ts: Date.now() });
  
  // Schedule feedback message after cooldown
  setTimeout(async () => {
    if (allowedToSend(from)) {
      try {
        await sendMessage.sendSimpleInfo(from, 
          "⏱️ Please wait a moment between messages", 'en');
      } catch (e) {
        console.warn('[buttonHandler] Failed to send rate limit message:', e.message);
      }
    }
  }, RL_MS + 100); // Slightly after cooldown period
} */

// 3) Session in-memory patch helper
async function defaultUpsertSession(userId, patch) { /* no-op for embedded usage */ }

// ===== Canonical ID map (unchanged) =====
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

// ===== Keyword → action routing (unchanged) =====
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

// ===== Utilities (unchanged) =====
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

// ===== REVISED: Core router with error handling and timeouts =====
async function routeAction(action, from, session, upsertSession = defaultUpsertSession) {
  try {
    const lang = pickLang(session);
    emit('route_action', { from, action, lang, ts: Date.now() });

    switch (action) {
      // Menus - Add timeout protection to each
      case 'MAIN_MENU':
        await withTimeout(sendMessage.sendMainMenu(from, lang), 5000);
        await upsertSession(from, { lastMenu: 'main' });
        return true;

      case 'JEWELLERY_MENU':
        await withTimeout(sendMessage.sendJewelleryCategoriesMenu(from, lang), 5000);
        await upsertSession(from, { lastMenu: 'jewellery' });
        return true;

      case 'OFFERS_MENU':
        await withTimeout(sendMessage.sendOffersAndMoreMenu(from, lang), 5000);
        await upsertSession(from, { lastMenu: 'offers' });
        return true;

      case 'PAYMENT_MENU':
        await withTimeout(sendMessage.sendPaymentAndTrackMenu(from, lang), 5000);
        await upsertSession(from, { lastMenu: 'payment_track' });
        return true;

      case 'CHAT_MENU':
        await withTimeout(sendMessage.sendChatWithUsCta(from, lang), 5000);
        await upsertSession(from, { lastMenu: 'chat' });
        return true;

      case 'SOCIAL_MENU':
        await withTimeout(sendMessage.sendSocialMenu(from, lang), 5000);
        await upsertSession(from, { lastMenu: 'social' });
        return true;

      // CTAs / Links - Add timeout protection
      case 'OPEN_WEBSITE':
        await withTimeout(
          sendMessage.sendSimpleInfo(from, `🌐 Browse our website:\n${sendMessage.LINKS.website}`, lang),
          5000
        );
        return true;

      case 'OPEN_CATALOG':
        await withTimeout(
          sendMessage.sendSimpleInfo(from, `📱 WhatsApp Catalogue:\n${sendMessage.LINKS.whatsappCatalog}`, lang),
          5000
        );
        return true;

      case 'OPEN_BESTSELLERS':
        await withTimeout(
          sendMessage.sendSimpleInfo(from, `🛍️ Shop Bestsellers:\n${sendMessage.LINKS.offersBestsellers}`, lang),
          5000
        );
        return true;

      case 'PAY_NOW':
        await withTimeout(
          sendMessage.sendSimpleInfo(from, `💳 Pay via UPI/Card/Netbanking:\n${sendMessage.LINKS.payment}`, lang),
          5000
        );
        return true;

      case 'TRACK_ORDER':
        await withTimeout(
          sendMessage.sendSimpleInfo(from, `📦 Track your order:\n${sendMessage.LINKS.shiprocket}`, lang),
          5000
        );
        return true;

      case 'CHAT_NOW':
        await withTimeout(
          sendMessage.sendSimpleInfo(from, `💬 Chat with us:\n${sendMessage.LINKS.waMeChat}`, lang),
          5000
        );
        return true;

      case 'OPEN_FACEBOOK':
        await withTimeout(
          sendMessage.sendSimpleInfo(from, `📘 Facebook:\n${sendMessage.LINKS.facebook}`, lang),
          5000
        );
        return true;

      case 'OPEN_INSTAGRAM':
        await withTimeout(
          sendMessage.sendSimpleInfo(from, `📸 Instagram:\n${sendMessage.LINKS.instagram}`, lang),
          5000
        );
        return true;

      case 'SHOW_LIST':
        await withTimeout(
          sendMessage.sendSimpleInfo(from, `📜 Categories coming soon.\nMeanwhile explore:\n${sendMessage.LINKS.website}`, lang),
          5000
        );
        return true;

      default:
        return false;
    }
  } catch (error) {
    console.error(`[routeAction] Error for ${from}, action ${action}:`, error.message);
    emit('route_error', { from, action, error: error.message, ts: Date.now() });
    
    // Try to send fallback message
    try {
      await sendMessage.sendSimpleInfo(from, 
        "⚠️ Something went wrong. Please try again or type 'menu' to start over.", 'en');
    } catch (fallbackError) {
      console.error('[routeAction] Fallback message also failed:', fallbackError.message);
    }
    
    return false;
  }
}

// ===== REVISED: Webhook handler with better error handling =====
async function handleIncomingWebhook(body, upsertSession = defaultUpsertSession) {
  try {
    // Warn if using default no-op session handler
    if (upsertSession === defaultUpsertSession) {
      console.warn('[buttonHandler] Using no-op session handler - sessions won\'t persist!');
    }

    // Robustly extract messages
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    const msgs = [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const ch of changes) {
        const v = ch?.value || {};
        if (Array.isArray(v.messages) && v.messages.length) {
          for (const m of v.messages) msgs.push(m);
        }
      }
    }
    if (!msgs.length) return false;

    for (const m of msgs) {
      try { // Add inner try-catch for each message
        const waId = m.id || '';
        if (!dedupe(waId)) continue;

        const from = String(m.from || '');
        const type = m.type;

        // Socket typing hint
        emit('user_typing', { from, ts: Date.now() });

        // --- Interactive ---
        if (type === 'interactive') {
          const reply = m.interactive?.button_reply || m.interactive?.list_reply || {};
          const raw = reply?.id || reply?.title || reply?.row_id || '';
          const action = normalizeId(raw);
          if (!action) continue;

          // REVISED: Better rate limit handling
          if (allowedToSend(from)) {
            await queuedRoute(from, action, { lang: 'en' }, upsertSession);
          } else {
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
          } catch (translateError) {
            console.warn('[buttonHandler] Translation failed:', translateError.message);
          }

          // Store language for future
          await upsertSession(from, { lang: detectedLang });

          // Keyword route
          let action = 'MAIN_MENU';
          for (const k of keywords) {
            if (k.re.test(translated)) {
              action = k.action;
              break;
            }
          }

          // REVISED: Better rate limit handling
          if (allowedToSend(from)) {
            await queuedRoute(from, action, { lang: detectedLang }, upsertSession);
          } else {
          emit('router_skip_rl', { from, action, ts: Date.now() });
          }

          emit('text_routed', { from, original, translated, detectedLang, action, ts: Date.now() });
          continue;
        }

        // --- Media stubs ---
        if (['image', 'audio', 'video', 'document', 'sticker'].includes(type)) {
          if (allowedToSend(from)) {
            try {
              await withTimeout(
                sendMessage.sendSimpleInfo(from, '✅ Received. Our team will respond shortly.', 'en'),
                5000
              );
            } catch (mediaError) {
              console.warn('[buttonHandler] Failed to acknowledge media:', mediaError.message);
            }
          }
          emit('media_received', { from, type, ts: Date.now() });
          continue;
        }
      } catch (msgError) {
        console.warn('[buttonHandler] Error processing single message:', msgError.message);
        // Continue to next message instead of failing entire batch
      }
    }

    return true;
  } catch (e) {
    console.error('[buttonHandler] handleIncomingWebhook critical error:', e.message);
    return false;
  }
}

// ===== REVISED: Frontend/socket entry with error handling =====
async function handleButtonClick(from, payload, session = {}, upsertSession = defaultUpsertSession) {
  try {
    if (!from) return false;
    const raw = String(payload || '').trim();

    // Normalize button ID
    const action = normalizeId(raw);
    if (action) {
      return await queuedRoute(from, action, session, upsertSession);
    }

    // Keyword fallback
    for (const k of keywords) {
      if (k.re.test(raw)) {
        return await queuedRoute(from, k.action, session, upsertSession);
      }
    }

    // Default
    return await queuedRoute(from, 'MAIN_MENU', session, upsertSession);
  } catch (error) {
    console.error('[handleButtonClick] Error:', error.message);
    return false;
  }
}

module.exports = {
  handleButtonClick,
  handleIncomingWebhook,
  routeAction,
  setSocket,
};
