// Hindi menus — all button titles ≤ 20 chars
module.exports = {
  mainMenu: {
    welcomeText: "🎉 KAAPAV फैशन ज्वेलरी में आपका स्वागत है! 👋",
    bodyText: "हम आपकी कैसे मदद कर सकते हैं? शुरू करने के लिए नीचे विकल्प चुनें:",
    buttons: [
      { id: "jewellery_categories", title: "गहने देखें 💎" },
      { id: "chat_with_us",        title: "हमसे बात करें 💬" },
      { id: "offers_more",         title: "ऑफर 🎉 व अधिक" }
    ]
  },

  mainMenuAlt: {
    text: "मुख्य मेनू — त्वरित क्रियाएँ:",
    bodyText: "एक विकल्प चुनें",
    buttons: [
      { id: "offers_more",    title: "🎉 ऑफर" },
      { id: "payment_orders", title: "भुगतान व ऑर्डर 💳" },
      { id: "back_main_menu", title: "मुख्य मेनू ⬅️" }
    ],
    footer: "आगे बढ़ने के लिए चुनें"
  },

  jewelleryMenu: {
    text: "💎 हमारे ज्वेलरी कलेक्शन को देखें",
    bodyText: "गहने — विकल्प चुनें:",
    buttons: [
      { id: "open_website_browse", title: "गहने देखें 💎" },
      { id: "open_wa_catalog",     title: "WA कैटलॉग" },
      { id: "back_main_menu",      title: "मुख्य मेनू ⬅️" }
    ]
  },

  offersMenu: {
    bodyText: "वर्तमान ऑफर 🎉 व ऑर्डर — चुनें:",
    buttons: [
      { id: "current_offers", title: "ऑफर 🎉 व अधिक" },
      { id: "payment_orders", title: "भुगतान व ऑर्डर 💳" },
      { id: "back_main_menu", title: "मुख्य मेनू ⬅️" }
    ]
  },

  currentOffersMenu: {
    text: "✨ सभी ज्वेलरी पर 50% छूट\n🚚 ₹499 से अधिक पर फ्री शिपिंग\n🛍️ बेस्टसेलर्स:",
    bodyText: "ऑफर — क्रिया:",
    buttons: [
      { id: "shop_now",         title: "अभी खरीदें 🛒" },
      { id: "back_offers_menu", title: "वापस ऑफर ⬅️" },
      { id: "back_main_menu",   title: "मुख्य मेनू ⬅️" }
    ]
  },

  paymentMenu: {
    text: "💳 भुगतान करें",
    bodyText: "भुगतान व ऑर्डर — चुनें:",
    buttons: [
      { id: "pay_via_upi",  title: "UPI से भुगतान" },
      { id: "pay_via_card", title: "कार्ड से भुगतान" },
      { id: "track_order",  title: "ऑर्डर ट्रैक 📦" }
    ]
  },

  websiteCta: {
    text: "KAAPAV वेबसाइट खोलें:",
    bodyText: "जारी रखें",
    buttons: [{ id: "back_main_menu", title: "मुख्य मेनू ⬅️" }]
  },

  catalogCta: {
    text: "हमारा WhatsApp कैटलॉग:",
    bodyText: "जारी रखें",
    buttons: [{ id: "back_main_menu", title: "मुख्य मेनू ⬅️" }]
  },

  paymentCta: {
    text: "सुरक्षित भुगतान करें:",
    bodyText: "जारी रखें",
    buttons: [{ id: "back_main_menu", title: "मुख्य मेनू ⬅️" }]
  },

  trackOrderCta: {
    text: "ऑर्डर ट्रैक करें:",
    bodyText: "जारी रखें",
    buttons: [{ id: "back_main_menu", title: "मुख्य मेनू ⬅️" }]
  },

  chatMenu: {
    text: "💬 हमसे चैट करें:",
    bodyText: "और मदद चाहिए?",
    buttons: [
      { id: "connect_agent",  title: "एजेंट से जुड़ें" },
      { id: "back_main_menu", title: "मुख्य मेनू ⬅️" }
    ]
  },

  connectAgent: {
    text: "धन्यवाद — एजेंट आपकी मदद करेगा। कृपया अपना ऑर्डर नंबर/प्रश्न साझा करें ताकि हम जल्दी सहायता कर सकें।"
  }
};
