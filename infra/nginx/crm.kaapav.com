# ================================
# crm.kaapav.com - Nginx vhost
# /etc/nginx/sites-enabled/crm.kaapav.com
# ================================

# --- HTTP -> HTTPS redirect ---
server {
    listen 80;
    listen [::]:80;
    server_name crm.kaapav.com www.crm.kaapav.com;
    return 301 https://$host$request_uri;
}

# --- HTTPS site ---
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name crm.kaapav.com;

    # --- SSL (Certbot defaults; adjust paths if different) ---
    ssl_certificate     /etc/letsencrypt/live/crm.kaapav.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.kaapav.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # --- Basic hardening & perf ---
    client_max_body_size 20m;
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;

    # Gzip (optional)
    gzip on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript application/octet-stream application/xml application/xml+rss image/svg+xml;

    # --- Static UI (Vite/SPA) ---
    root /var/www/crm-ui;
    index index.html;

    # Redirect root to admin panel
    location = / {
        return 302 /admin/;
    }

    # SPA fallback & light caching for UI
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "public, max-age=60";
    }

    location /webhook/wa {
    proxy_pass http://127.0.0.1:5555/webhook/wa;
    proxy_set_header Host $host;
    proxy_http_version 1.1;
   } 
    # --- API (your backend on localhost:5555) ---
    location /api {
    proxy_pass http://127.0.0.1:5555;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
   

        # pass client IP & proto
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # --- Socket.IO (WebSocket upgrades) ---
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5555/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 75s;
        proxy_send_timeout 75s;

        # Forward client IP/proto
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # --- ACME challenge (keep if using certbot renew) ---
    location /.well-known/acme-challenge/ {
        root /var/www/crm.kaapav.com;
        allow all;
    }

    # Long cache for static assets
    location ~* \.(?:js|mjs|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?)$ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
