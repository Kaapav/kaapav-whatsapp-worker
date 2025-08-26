// utils/buttonHandler.js
// Centralized mapping of interactive ids -> menu keys (final)

const sendMessage = require("./sendMessage");

// Optional mongoose session model use inside handler — we don't require it, index.js passes upsertSession if needed
let SessionModel = null;
try {
  const mongoose = require("mongoose");
  const schema = new mongoose.Schema({
    userId: { type: String, index: true, unique: true },
    lastMenu: String,
    meta: Object,
    updatedAt: { type: Date, default: Date.now }
  });
  SessionModel = mongoose.models.Session || mongoose.model("Session", schema);
} catch (e) {
  SessionModel = null;
}

// minimal local cache
const inMemory = {};

async function saveSessionLocal(userId, patch = {}) {
  inMemory[userId] = Object.assign({}, inMemory[userId] || {}, patch, { updatedAt: new Date(), userId });
  if (SessionModel) {
    try {
      await SessionModel.updateOne({ userId }, { $set: inMemory[userId] }, { upsert: true });
    } catch (e) { /* swallow */ }
  }
}

/**
 * handleButtonClick(from, buttonId, session, upsertSessionCallback)
 * - from: sender phone
 * - buttonId: string id from interactive reply (list or button)
 * - session: loaded session object (optional)
 * - upsertSessionCallback: function(userId, patch) provided by index.js to persist
 */
module.exports = async function handleButtonClick(from, buttonId, session = {}, upsertSessionCallback) {
  try {
    const id = String(buttonId || "").trim().toLowerCase();
    console.log("🔧 buttonHandler mapping id:", id, "for", from);

    // Normalize common variations
    const map = {
      browse: "browse",
      categories: "browse",
      catalogue: "catalogue",
      view_catalogue: "catalogue",
      offers: "offers",
      check_offers: "offers",
      payment: "payment",
      proceed_payment: "payment",
      track: "track",
      tracking: "track",
      review: "review",
      google_review: "review",
      chat: "chat",
      chat_support: "chat",
      main: "main",
      main_menu: "main",
      back_main: "main",
      "🏠 main menu": "main"
    };

    // category checks (bracelet, necklace, etc)
    if (id.includes("bracelet") || id === "bracelets") {
      await sendMessage.sendCategoryMessage(from, "bracelets");
      await saveSessionLocal(from, { lastMenu: "bracelets" });
      if (upsertSessionCallback) await upsertSessionCallback(from, { lastMenu: "bracelets" });
      return;
    }
    if (id.includes("necklace") || id === "necklaces") {
      await sendMessage.sendCategoryMessage(from, "necklaces");
      await saveSessionLocal(from, { lastMenu: "necklaces" });
      if (upsertSessionCallback) await upsertSessionCallback(from, { lastMenu: "necklaces" });
      return;
    }
    if (id.includes("earring") || id === "earrings") {
      await sendMessage.sendCategoryMessage(from, "earrings");
      await saveSessionLocal(from, { lastMenu: "earrings" });
      if (upsertSessionCallback) await upsertSessionCallback(from, { lastMenu: "earrings" });
      return;
    }
    if (id.includes("earring_set") || id.includes("earring sets") || id === "earring_sets") {
      await sendMessage.sendCategoryMessage(from, "earring_sets");
      await saveSessionLocal(from, { lastMenu: "earring_sets" });
      if (upsertSessionCallback) await upsertSessionCallback(from, { lastMenu: "earring_sets" });
      return;
    }
    if (id.includes("pendant") || id === "pendants") {
      await sendMessage.sendCategoryMessage(from, "pendants");
      await saveSessionLocal(from, { lastMenu: "pendants" });
      if (upsertSessionCallback) await upsertSessionCallback(from, { lastMenu: "pendants" });
      return;
    }
    if (id.includes("ring") || id === "rings") {
      await sendMessage.sendCategoryMessage(from, "rings");
      await saveSessionLocal(from, { lastMenu: "rings" });
      if (upsertSessionCallback) await upsertSessionCallback(from, { lastMenu: "rings" });
      return;
    }

    // mapped top-level keys
    if (map[id]) {
      const key = map[id];
      await sendMessage.sendMenu(from, key);
      await saveSessionLocal(from, { lastMenu: key });
      if (upsertSessionCallback) await upsertSessionCallback(from, { lastMenu: key });
      return;
    }

    // If direct menu key
    if (sendMessage.MENUS && sendMessage.MENUS[id]) {
      await sendMessage.sendMenu(from, id);
      await saveSessionLocal(from, { lastMenu: id });
      if (upsertSessionCallback) await upsertSessionCallback(from, { lastMenu: id });
      return;
    }

    // fallback: main
    await sendMessage.sendMenu(from, "main");
    await saveSessionLocal(from, { lastMenu: "main" });
    if (upsertSessionCallback) await upsertSessionCallback(from, { lastMenu: "main" });
    return;

  } catch (err) {
    console.error("❌ buttonHandler error:", err && err.stack ? err.stack : err);
    try { await sendMessage.sendMenu(from, "main"); } catch (e) {}
  }
};
