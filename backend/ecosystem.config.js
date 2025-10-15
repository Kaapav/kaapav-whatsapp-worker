module.exports = {
  apps: [
    {
      name: 'wa-worker',
      script: "index.js",
      cwd: '/home/ubuntu/kaapav-bot/kaapav-whatsapp-worker/backend',   // runs from backend folder
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 5555,
ADMIN_TOKEN="KAAPAV_ADMIN_123"
   BASE_URL: "https://www.crm.kaapav.com",
        // WhatsApp Cloud API
        WHATSAPP_ACCESS_TOKEN: "EAAI6dZCuTmYYBPFs5zVM7jPrDTAsHsyjHsl2d6ZAc5do7BpnwwydjXL6L7tvuIFSauTZBxoCogmKvtJWKwDkofXjI0mZAbPkLQ7fwsBMgG3XioKA1MqePVYK6h8P6IZCFBow6qHpw6nZC7zPH3ITdnaWrxOj4ZBORhjPmj9Yxlz0Kej6UFHOS4sbVTItWllYrPcZAgZDZD",
        WHATSAPP_PHONE_NUMBER_ID: "745230991999571",
        GRAPH_API_VERSION: "v17.0",

        // Optional integrations
        MONGO_URI: "mongodb+srv://kaapavin:Kaapav%40123%21@cluster0.usauxbv.mongodb.net/tiledesk?retryWrites=true&w=majority&appName=Cluster0&connectTimeoutMS=30000",
        SHEETS_ENABLED: "0"
      }
    }
  ]
}
