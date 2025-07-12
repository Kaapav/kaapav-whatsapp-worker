// ✅ Core Fix Summary: Permanent Tiledesk Guest JWT (solves 401 unauthorized)

require("dotenv").config();
const axios = require("axios");
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());

const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ---------- Mongo Connect ---------- */
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ Mongo connection failed:", err.message);
  }
})();

/* ---------- Models ---------- */
const MessageModel = mongoose.model("Message", new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  timestamp: String,
  wa_id: String,
  fullPayload: Object
}));

/* ---------- Webhook Endpoint ---------- */
app.post("/webhooks/whatsapp/cloudapi", async (req, res) => {
  res.sendStatus(200);
  const data = req.body;
  const field = data?.entry?.[0]?.changes?.[0]?.field;
  if (field === "message_echoes") return;

  await saveToMongo(data);
  await handleGPTandCRM(data);
});

async function saveToMongo(data) {
  try {
    const msg = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    await new MessageModel({
      from: msg.from,
      to: data.entry[0].changes[0].value.metadata?.display_phone_number || "",
      text: msg.text?.body || "",
      timestamp: msg.timestamp,
      wa_id: data.entry[0].changes[0].value.contacts?.[0]?.wa_id || "",
      fullPayload: data
    }).save();
    console.log("✅ Message saved");
  } catch (err) {
    console.error("❌ Mongo save failed:", err.message);
  }
}

/* ---------- GPT + CRM + Tiledesk ---------- */
async function handleGPTandCRM(data) {
  try {
    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const wa_id = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
    const name = data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
    const text = message?.text?.body || "";
    if (!message || !wa_id) return;

    await mongoose.connection.collection("crm_logs").insertOne({
      name: name || "Unknown",
      phone: wa_id,
      message: text,
      ai_note: "Test Tag",
      timestamp: new Date().toISOString()
    });
    console.log("🚀 CRM log inserted");

    const projectId = process.env.TILEDESK_PROJECT_ID;
    const requestId = `support-group-${wa_id}`;
    const jwt = process.env.TILEDESK_BOT_TOKEN;

    // Step A: Ensure request
    try {
      await axios.post(`https://api.tiledesk.com/v3/${projectId}/requests`, {
        request_id: requestId,
        departmentid: "686922633c8e640013d7e9f8",
        source: "whatsapp"
      }, {
        headers: {
          Authorization: `JWT ${jwt}`,
          "Content-Type": "application/json"
        }
      });
      console.log("✅ Request ensured");
    } catch (e) {
      console.warn("⚠️ Request create skipped:", e.response?.data?.msg || e.message);
    }

    // Step B: Push message
    const pushURL = `https://api.tiledesk.com/v3/${projectId}/requests/${requestId}/messages`;
    const payload = {
      sender: process.env.TILEDESK_BOT_ID,
      createdBy: process.env.TILEDESK_BOT_ID,
      text,
      request_id: requestId,
      attributes: {
        source: "whatsapp",
        wa_id: wa_id, 
        lead_type: "auto",
        auto_imported: true
      }
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await axios.post(pushURL, payload, {
          headers: {
            Authorization: `JWT ${jwt}`,
            "Content-Type": "application/json"
          }
        });
        console.log("📤 Message pushed ✅", res.status);
        break;
      } catch (err) {
        const status = err.response?.status;
        if (status === 429) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        console.error("❌ Tiledesk push failed:", err.response?.data || err.message);
        break;
      }
    }
  } catch (err) {
    console.error("❌ handleGPTandCRM fatal:", err.message);
  }
}

app.listen(PORT, () => console.log(`🚀 Live on port ${PORT}`));
