#!/bin/bash
# Deploy cockpit from kaapav-chat-ui → backend/public/dashboard

set -e

echo "🚀 Building React cockpit..."
cd "$(dirname "$0")/kaapav-chat-ui"
npm install
npm run build

echo "📂 Copying build to backend/public/dashboard..."
rm -rf ../backend/public/dashboard/*
mkdir -p ../backend/public/dashboard
cp -r dist/* ../backend/public/dashboard/

echo "🔄 Restarting backend..."
cd ../backend
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart kaapav-bot || pm2 start index.js --name kaapav-bot --update-env -- PORT=3001
else
  PORT=3001 node index.js
fi

echo "✅ Deploy complete! Visit: /dashboard"
