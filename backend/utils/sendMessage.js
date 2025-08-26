// utils/sendMessage.js
// Handles building and sending WhatsApp messages using Graph API (v17.0)
// Uses your Kaapav UI strings/links as canonical content.

const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const WA_PHONE_ID = process.env.WA_PHONE_ID;
const META_TOKEN = process.env.META_TOKEN || process.env.WHATSAPP_TOKEN;
const GRAPH_URL = `https://graph.facebook.com/v17.0/${WA_PHONE_ID}/messages`;

if (!WA_PHONE_ID || !META_TOKEN) {
  console.warn("⚠️ WA_PHONE_ID or META_TOKEN not set — sending will fail.");
}

// Menu & categories (based on your KaapavChatUI)
const MENUS = {
  main: {
    text: `🎉 Welcome to KAAPAV Fashion Jewellery! 👋\nWhat can we assist you with today?`,
    buttons: [
      { id: "browse", title: "💎 Browse Jewellery Categories" },
      { id: "catalogue", title: "📱 View Full WhatsApp Catalogue" },
      { id: "offers", title: "🎉 Check Our Current Offers" },
      { id: "payment", title: "💳 Proceed to Payment via Razorpay" },
      { id: "track", title: "📦 Track Your Order" },
      { id: "review", title: "✨ Leave Us a Google Review" },
      { id: "chat", title: "💬 Need More Assistance? Chat with Us!" }
    ]
  },

  // Browse submenu
  browse: {
    text: `💎 Browse Jewellery Categories\nSelect from the options below:`,
    buttons: [
      { id: "bracelets", title: "💎 Bracelets" },
      { id: "necklaces", title: "💍 Necklaces" },
      { id: "earrings", title: "💖 Earrings" },
      { id: "earring_sets", title: "💫 Earring Sets" },
      { id: "pendants", title: "🌟 Pendants" },
      { id: "rings", title: "💍 Rings" },
      { id: "main", title: "🏠 Main Menu" }
    ]
  },

  // category-specific content as text menus (used by sendMenu)
  bracelets: {
    text: `💎 *Bracelets Collection*\nElegance on your wrist, grace in every gesture ✨💫\n🛍️ Explore: https://www.kaapav.com/shop/category/all-jewellery-bracelets-13`
  },
  necklaces: {
    text: `💍 *Necklaces Collection*\nWhere luxury meets elegance. Crafted for every queen.\n🛍️ Explore: https://www.kaapav.com/shop/category/all-jewellery-necklace-19`
  },
  earrings: {
    text: `💖 *Earrings Collection*\nSparkle that speaks louder than words.\n🛍️ Explore: https://www.kaapav.com/shop/category/all-jewellery-earrings-21`
  },
  earring_sets: {
    text: `💫 *Earring Sets*\nComplete matching grace – pair perfection.\n🛍️ Explore: https://www.kaapav.com/shop/category/all-jewellery-earring-pendant-sets-23`
  },
  pendants: {
    text: `🌟 *Pendants*\nMinimal yet majestic centerpieces of beauty.\n🛍️ Explore: https://www.kaapav.com/shop/category/all-jewellery-pendant-22`
  },
  rings: {
    text: `💍 *Rings*\nA sparkle of sophistication to crown your fingers.\n🛍️ Explore: https://www.kaapav.com/shop/category/all-jewellery-rings-20`
  },

  // non-menu actions: catalogue/offers/payment/track/review/chat
  catalogue: {
    text: `📱 *Explore the World of KAAPAV Elegance*\nYour next statement piece is just a tap away!\nhttps://wa.me/c/919148330016`
  },
  offers: {
    text: `💫 *Exclusive Offers!* 🎉\nFlat 50% OFF on select KAAPAV Jewellery.\n🛍️ Bestsellers: https://www.kaapav.com/shop/category/all-jewellery-12?category=12&search=&order=&tags=16`
  },
  payment: {
    text: `💳 *Secure Payments via Razorpay*\nPay via UPI/Cards/Wallets: https://razorpay.me/@kaapav`
  },
  track: {
    text: `📦 *Track Your Order*\nTrack here: https://www.shiprocket.in/shipment-tracking/`
  },
  review: {
    text: `✨ *We value your feedback!*\nLeave a review: https://g.page/r/CcKIroQb3LjrEBM/review`
  },
  chat: {
    text: `💬 *Chat with Us*\nConnect: https://wa.me/message/RAKKAAPAVCHAT`
  }
};

// helpers to build payloads
function buildInteractiveList(menu) {
  const rows = (menu.buttons || []).map(b => ({ id: b.id, title: b.title }));
  return {
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: (menu.headerText || "KAAPAV") },
      body: { text: menu.text },
      footer: { text: "KAAPAV Fashion Jewellery" },
      action: { button: "Choose an option", sections: [{ title: "Menu", rows }] }
    }
  };
}

function buildInteractiveButtons(menu) {
  // WhatsApp button interactive supports up to 3; we fallback to text/list if >3
  const buttons = (menu.buttons || []).slice(0, 3).map(b => ({ type: "reply", reply: { id: b.id, title: b.title } }));
  return {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: menu.text },
      action: { buttons }
    }
  };
}

function buildTextPayload(text) {
  return { type: "text", text: { body: text } };
}

// send raw payload to WhatsApp Graph API
async function sendWhatsApp(to, payload) {
  try {
    const body = Object.assign({ messaging_product: "whatsapp", to }, payload);
    const res = await axios.post(GRAPH_URL, body, {
      headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
      timeout: 8000
    });
    console.log(`✅ Sent payload to ${to}`, payload?.type || "text");
    return res.data;
  } catch (err) {
    console.error("❌ sendWhatsApp error:", err.response?.data || err.message);
    throw err;
  }
}

// public API

async function sendMenu(to, key = "main") {
  try {
    const menu = MENUS[key] || MENUS.main;
    // If it's a list of many options, send interactive list
    if (menu.buttons && menu.buttons.length > 3) {
      const payload = buildInteractiveList(menu);
      return await sendWhatsApp(to, payload);
    }
    // if <=3 prefer button interactive
    if (menu.buttons && menu.buttons.length > 0) {
      const payload = buildInteractiveButtons(menu);
      return await sendWhatsApp(to, payload);
    }
    // otherwise send text
    return await sendWhatsApp(to, buildTextPayload(menu.text));
  } catch (err) {
    console.error("❌ sendMenu error:", err.message || err);
    // fallback: send text only
    try {
      const menu = MENUS[key] || MENUS.main;
      await sendWhatsApp(to, buildTextPayload(menu.text + "\n\nReply using the menu."));
    } catch (e) {
      console.error("❌ fallback send failed:", e.message || e);
    }
  }
}

async function sendText(to, text) {
  try {
    return await sendWhatsApp(to, buildTextPayload(text));
  } catch (err) {
    console.error("❌ sendText error:", err.message || err);
  }
}

async function sendCategoryMessage(to, categoryKey) {
  try {
    const c = MENUS[categoryKey];
    if (!c) return sendText(to, "❌ Category not found!");
    return sendText(to, c.text);
  } catch (err) {
    console.error("❌ sendCategoryMessage err:", err.message || err);
  }
}

module.exports = {
  sendMenu,
  sendText,
  sendCategoryMessage,
  MENUS
};
