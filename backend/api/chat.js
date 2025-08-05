const express = require('express');
const router = express.Router();

router.post('/', (req, res) => {
  const { message } = req.body;

  // Dummy response until bot logic is plugged
  const reply = message.toLowerCase().includes('bracelet')
    ? '💎 Looking for bracelets? Check: https://kaapav.com/...'
    : `🤖 You said: "${message}"`;

  res.json({ reply });
});

module.exports = router;
