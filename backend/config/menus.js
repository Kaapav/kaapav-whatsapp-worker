// English menus — all button titles ≤ 20 chars
module.exports = {
  // ===== Main Menus =====
  mainMenu: {
    welcomeText: "🎉 Welcome to KAAPAV Fashion Jewellery! 👋",
    bodyText: "What can we assist you with today? Select an option below to get started:",
    buttons: [
      { id: "jewellery_categories", title: "Browse Jewellery 💎" }, // 20 chars exactly
      { id: "chat_with_us",        title: "Chat with Us! 💬" },
      { id: "offers_more",         title: "Offers 🎉 & More" }
    ],
    footer: undefined
  },

  mainMenuAlt: {
    text: "Main Menu — quick actions:",
    bodyText: "Choose an option",
    buttons: [
      { id: "offers_more",    title: "🎉 Offers" },         // short
      { id: "payment_orders", title: "Pay & Orders 💳" },   // 14 + 2 = 16
      { id: "back_main_menu", title: "Back to Main ⬅️" }
    ],
    footer: "Select to continue"
  },

  // ===== Sub-Menu: Jewellery =====
  jewelleryMenu: {
    text: "💎 Explore Our Jewellery",
    bodyText: "Browse Jewellery — choose:",
    buttons: [
      { id: "open_website_browse", title: "Browse Jewellery 💎" },
      { id: "open_wa_catalog",     title: "WA Catalogue" },
      { id: "back_main_menu",      title: "Back to Main ⬅️" }
    ],
    footer: undefined
  },

  // ===== Sub-Menu: Offers & More =====
  offersMenu: {
    bodyText: "Current Offers 🎉 & Orders — choose:",
    buttons: [
      { id: "current_offers", title: "Offers 🎉 & More" },
      { id: "payment_orders", title: "Pay & Orders 💳" },
      { id: "back_main_menu", title: "Back to Main ⬅️" }
    ],
    footer: undefined
  },

  currentOffersMenu: {
    text: "✨ Flat 50% OFF on All Jewellery\n🚚 Free Shipping on Orders Above ₹499\n🛍️ Bestsellers:",
    bodyText: "Offers — actions:",
    buttons: [
      { id: "shop_now",         title: "Shop Now 🛒" },
      { id: "back_offers_menu", title: "Back to Offers ⬅️" },
      { id: "back_main_menu",   title: "Back to Main ⬅️" }
    ],
    footer: undefined
  },

  // ===== Payment =====
  paymentMenu: {
    text: "💳 Proceed to Payment",
    bodyText: "Payment & Orders — choose:",
    buttons: [
      { id: "pay_via_upi",  title: "Pay via UPI" },
      { id: "pay_via_card", title: "Pay via Card" }, // shorter than Card/Netbanking; avoids trim
      { id: "track_order",  title: "Track Order 📦" }
    ],
    footer: undefined
  },

  // ===== CTAs =====
  websiteCta: {
    text: "Open KAAPAV website:",
    bodyText: "Continue",
    buttons: [{ id: "back_main_menu", title: "Back to Main ⬅️" }],
    footer: undefined
  },

  catalogCta: {
    text: "Open our WhatsApp Catalog:",
    bodyText: "Continue",
    buttons: [{ id: "back_main_menu", title: "Back to Main ⬅️" }],
    footer: undefined
  },

  paymentCta: {
    text: "Proceed to secure payment:",
    bodyText: "Continue",
    buttons: [{ id: "back_main_menu", title: "Back to Main ⬅️" }],
    footer: undefined
  },

  trackOrderCta: {
    text: "Track your order:",
    bodyText: "Continue",
    buttons: [{ id: "back_main_menu", title: "Back to Main ⬅️" }],
    footer: undefined
  },

  chatMenu: {
    text: "💬 Chat with us:",
    bodyText: "Need more help?",
    buttons: [
      { id: "connect_agent",  title: "Connect to Agent" },
      { id: "back_main_menu", title: "Back to Main ⬅️" }
    ],
    footer: undefined
  },

  connectAgent: {
    text: "Thanks — an agent will assist you. Please share your order number or query so we can help faster."
  }
};
