
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = 'kaapavverify'; // 🔒 Must match Meta Dashboard
const PHONE_NUMBER_ID = '745230991999571';
const ACCESS_TOKEN = 'EAAI6dZCuTmYYBOwJxSlzO0wuDstRZCZAhzZAHNYwU8HpAf8XaDpvrpIDrOmC55SUiJjMIxIGFe8WF3ply8Ae9kYZBRR2oNIAwCc0glIZB3IfuGUSShfldQPbxvQIV2MGzO8DWrZCnJrrZBATQhZBwUlPJRR7j2bLDQ8842j9nVsdCVIU148EtRkxMys9ZAPiIly1DmWQZDZD';

app.use(bodyParser.json());

// ✅ VERIFY TOKEN (GET)
app.get('/webhooks/whatsapp/cloudapi', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook Verified!');
    res.status(200).send(challenge);
  } else {
    console.warn('❌ Verification failed');
    res.sendStatus(403);
  }
});

// ✅ MESSAGE HANDLER (POST)
app.post('/webhooks/whatsapp/cloudapi', async (req, res) => {
  const body = req.body;
  console.log('📨 Incoming Webhook:', JSON.stringify(body, null, 2));

  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (message) {
    const from = message.from; // Customer's number
    const text = message.text?.body || 'No text';

    const payload = {
      messaging_product: 'whatsapp',
      to: from,
      text: { body: `Hi 👋, you said: "${text}"` }
    };

    try {
      const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
      await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      console.log(`✅ Replied to ${from}`);
    } catch (err) {
      console.error('❌ Reply Error:', err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});

// ✅ START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Kaapav CloudAPI bot live at http://localhost:${PORT}`);
});
