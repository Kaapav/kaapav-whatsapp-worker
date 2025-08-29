// File: utils/translate.js
const axios = require('axios');

// Detect & translate text to English
async function toEnglish(text) {
  try {
    const res = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: {
        client: 'gtx',
        sl: 'auto',   // auto-detect source language
        tl: 'en',     // target English
        dt: 't',
        q: text
      }
    });

    const translated = res.data[0]?.map(t => t[0]).join('') || text;
    const detectedLang = res.data[2] || 'unknown';

    return { translated, detectedLang };
  } catch (err) {
    console.error('Translate error:', err.message);
    return { translated: text, detectedLang: 'en' }; // fallback
  }
}

// Translate from English → targetLang (for menus/outgoing text)
async function fromEnglish(text, targetLang = 'en') {
  try {
    if (targetLang === 'en') return text;

    const res = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: {
        client: 'gtx',
        sl: 'en',
        tl: targetLang,
        dt: 't',
        q: text
      }
    });

    return res.data[0]?.map(t => t[0]).join('') || text;
  } catch (err) {
    console.error('Translate error:', err.message);
    return text; // fallback
  }
}

module.exports = { toEnglish, fromEnglish };
