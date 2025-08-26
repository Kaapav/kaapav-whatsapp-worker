// sendMessage.js
// KAAPAV WhatsApp bot - all menu senders and CTA helpers
// Keep function names — buttonHandler expects them.
// Replace placeholder links in LINKS object with your final production URLs as needed.

const axios = require('axios');
require('dotenv').config();

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v17.0';
const API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

// ======== Deep links (update these placeholders with final URLs) ========
const LINKS = {
  website: 'https://www.kaapav.com',
  whatsappCatalog: 'https://wa.me/c/919148330016',
  waMeChat: 'https://wa.me/c/919148330016',
  offersBestsellers: 'https://www.kaapav.com/shop/category/all-jewellery-12?category=12&search=&order=&tags=16',
  upi: 'upi://pay?pa=your-upi@upi&pn=KAAPAV', // replace with real UPI deep link
  card: 'https://kaapav.com/pay/card', // replace with real card/netbanking link
  razorpay: 'https://kaapav.com/pay/razorpay', // optional
  shiprocket: 'https://www.shiprocket.in/shipment-tracking/',
  googleReview: 'https://g.page/YOUR-GOOGLE-REVIEW-LINK', // optional
};

// ======== Low-level sender ========
async function sendAPIRequest(payload) {
  try {
    const res = await axios.post(API_URL, payload, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
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
async function sendReplyButtons(to, bodyText, buttons /* array {id,title} up to 3 */, footer) {
  if (!buttons || !buttons.length) return sendText(to, bodyText);
  if (buttons.length > 3) buttons = buttons.slice(0, 3); // ensure <=3
  buttons = buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } }));

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons },
    },
  };
  if (footer) payload.interactive.footer = { text: footer };
  return sendAPIRequest(payload);
}

// CTA url interactive (single url)
async function sendCtaUrl(to, bodyText, displayText, url, footer) {
  // ensure tappable link first
  await sendText(to, `${bodyText}\n${displayText}: ${url}`);
  // then attempt interactive CTA (best-effort)
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button', // fallback to simple button
      body: { text: bodyText },
      action: { buttons: [{ type: 'reply', reply: { id: `OPEN_URL_${Math.random().toString(36).slice(2,8)}`, title: displayText.slice(0,20) } }] }
    }
  };
  if (footer) payload.interactive.footer = { text: footer };
  try {
    return await sendAPIRequest(payload);
  } catch (e) {
    // interactive not supported — we already sent the plain text link, so return gracefully
    return { error: 'interactive_failed', details: e?.message || e };
  }
}


// Fallback: send plain text with clickable URLs (useful for multiple payment links)
async function sendTextWithLinks(to, text) {
  return sendText(to, text);
}

// ======== High-level menus ========

// MAIN MENU - variant 1 (Main Menu-1)
async function sendMainMenu(to) {
  // greeting + 1st button set
  await sendText(to, '🎉 Welcome to KAAPAV Fashion Jewellery! 👋\nWhat can we assist you with today?');
  return sendReplyButtons(
    to,
    'KAAPAV — Main Menu',
    [
      { id: 'JEWELLERY_CATEGORIES', title: '💎 Jewellery' },
      { id: 'CHAT_WITH_US', title: '💬 Chat' },
      { id: 'OFFERS_MORE', title: '🎉 Offers' },
    ],
    'Tap an option'
  );
}

// MAIN MENU - variant 2 (Main Menu-2)
async function sendMainMenuAlt(to) {
  await sendText(to, 'Main Menu — quick actions:');
  return sendReplyButtons(
    to,
    'Choose an option',
    [
      { id: 'OFFERS', title: '🎉 Offers' },
      { id: 'PAYMENT_ORDERS', title: '💳 Pay & Orders' },
      { id: 'BACK_MAIN', title: '⬅️ Main Menu' },
    ],
    'Select to continue'
  );
}

// Sub-Menu 1.1: Jewellery Categories
async function sendJewelleryCategoriesMenu(to) {
  // send context first (includes WhatsApp catalog and website)
  await sendText(
    to,
    `Jewellery Categories 💎\n\n• Browse on website: ${LINKS.website}\n• WhatsApp Catalogue: ${LINKS.whatsappCatalog}\n\nNeed a chat? ${LINKS.waMeChat}`
  );

  // then quick buttons (max 3)
  return sendReplyButtons(
    to,
    'Jewellery — quick actions',
    [
      { id: 'OPEN_WEBSITE_BROWSE', title: '💎 Browse' },
      { id: 'OPEN_WA_CATALOG', title: '📱 Catalog' },
      { id: 'BACK_MAIN', title: '⬅️ Back' },
    ],
    'Or type the category name'
  );
}

// Sub-Menu 1.2: Offers & Payment (Offers & More)
async function sendOffersAndMoreMenu(to) {
  // detailed offers message + bestseller link
  await sendText(
    to,
    `🎉 Current Offers 🎉\n\n✨ Flat 50% OFF on All Jewellery\n🚚 Free Shipping on orders above ₹499\n\nBestselling collections: ${LINKS.offersBestsellers}`
  );

  // buttons for payment / tracking / back
  return sendReplyButtons(
    to,
    'Offers — next steps',
    [
      { id: 'PROCEED_PAYMENT', title: '💳 Proceed to Pay' },
      { id: 'TRACK_ORDER', title: '📦 Track Order' },
      { id: 'BACK_MAIN', title: '⬅️ Back' },
    ],
    'Secure checkout available'
  );
}

// Payment & Orders menu (detailed)
async function sendPaymentOrdersMenu(to) {
  // show both UPI and Card/Netbanking links in text (multiple links in one text is allowed)
  const paymentText = `Payment Options:\n\n1) UPI (quick):\n${LINKS.upi}\n\n2) Cards & Netbanking:\n${LINKS.card}\n\nOr use hosted Razorpay link:\n${LINKS.razorpay}`;
  await sendTextWithLinks(to, paymentText);

  // quick buttons to Pay or Track or Back
  return sendReplyButtons(
    to,
    'Payment & Orders',
    [
      { id: 'PAY_NOW', title: '💳 Pay Now' },
      { id: 'TRACK_ORDER', title: '📦 Track' },
      { id: 'BACK_MAIN', title: '⬅️ Main' },
    ],
    'Choose action'
  );
}

// Single CTA actions
async function sendWebsiteCta(to) {
  return sendCtaUrl(to, 'Open KAAPAV website', 'Open KAAPAV', LINKS.website, 'Happy shopping ✨');
}

async function sendWhatsappCatalogCta(to) {
  // WhatsApp Catalog url
  return sendCtaUrl(to, 'Open our WhatsApp Catalog', 'Open Catalog', LINKS.whatsappCatalog);
}

async function sendProceedToPaymentCta(to) {
  // direct Razorpay/hosted checkout
  return sendCtaUrl(to, 'Proceed to secure payment', 'Pay Now', LINKS.razorpay, 'Secure payment');
}

async function sendTrackOrderCta(to) {
  return sendCtaUrl(to, 'Track your order', 'Track Order', LINKS.shiprocket);
}

async function sendChatWithUsCta(to) {
  // we can either send the wa.me link as text or a CTA url.
  // send a short text with clickable wa.me link (customers tap to open chat)
  return sendCtaUrl(to, 'Chat with us on WhatsApp', 'Chat Now', LINKS.waMeChat);
}

// Support / Handoff
async function sendConnectAgentText(to) {
  return sendText(to, 'Thanks — an agent will assist you. Please share your order number or query so we can help faster.');
}

// small utility for testing / manual texts
async function sendSimpleInfo(to, text) {
  return sendText(to, text);
}

// Exports
module.exports = {
  // main menus
  sendMainMenu,
  sendMainMenuAlt,
  // submenus
  sendJewelleryCategoriesMenu,
  sendOffersAndMoreMenu,
  sendPaymentOrdersMenu,
  // CTAs
  sendWebsiteCta,
  sendWhatsappCatalogCta,
  sendProceedToPaymentCta,
  sendTrackOrderCta,
  sendChatWithUsCta,
  // support
  sendConnectAgentText,
  sendSimpleInfo,
  // === Aliases for backward compatibility ===
  sendChatMenu: sendChatWithUsCta,
  sendCurrentOffersMenu: sendOffersAndMoreMenu, 
  sendOffersMenu: sendOffersAndMoreMenu,
  sendOffers: sendOffersAndMoreMenu,
  sendBrowseJewelleryMenu: sendJewelleryCategoriesMenu,
  sendBrowseJewellery: sendJewelleryCategoriesMenu,
  sendPaymentMenu: sendPaymentOrdersMenu,
  sendPaymentTrackingMenu: sendPaymentOrdersMenu,
  sendTrackOrder: sendTrackOrderCta
};
