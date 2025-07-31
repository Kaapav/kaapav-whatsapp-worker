const axios = require("axios");
require("dotenv").config();

const sendMessage = async (to, text) => {
  const url = `https://graph.facebook.com/v18.0/${process.env.WA_PHONE_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.META_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
};

module.exports = { sendMessage };
