const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = 'kaapavverify';
const PHONE_NUMBER_ID = '745230991999571';
const ACCESS_TOKEN = 'EAAI6dZCuTmYYBOwJxSlzO0wuDstRZCZAhzZAHNYwU8HpAf8XaDpvrpIDrOmC55SUiJjMIxIGFe8WF3ply8Ae9kYZBRR2oNIAwCc0glIZB3IfuGUSShfldQPbxvQIV2MGzO8DWrZCnJrrZBATQhZBwUlPJRR7j2bLDQ8842j9nVsdCVIU148EtRkxMys9ZAPiIly1DmWQZDZD';

app.use(bodyParser.json());

// ✅ VERIFICATION ENDPOINT
app.get('/webhooks/whatsapp/cloudapi', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 📩 INCOMING MESSAGE HANDLER
app.post('/webhooks/whatsapp/cloudapi', async (req, res) => {
  console.log('📩 Incoming Webhook:', JSON.stringify(req.body, null, 2));

  const entry = req.body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (message) {
    const from = message.from;
    const userText = message.text?.body || '';

    const replyPayload = {
      messaging_product: 'whatsapp',
      to: from,
      text: { body: `Hi 👋, you said: "${userText}"` }
    };

    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
        replyPayload,
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ Replied to ${from}`);
    } catch (err) {
      console.error('❌ Reply Error:', err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Cloud API server running at http://localhost:${PORT}`);
});
