module.exports = {
  apps: [
    {
      name: "kaapav-bot",
      script: "index.js",
      cwd: "/home/ubuntu/kaapav-whatsapp-worker/backend",
      watch: true,
      env: {
        NODE_ENV: "production",
        PORT: 5555
      }
    }
  ]
};
