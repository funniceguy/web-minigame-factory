# NGINX Reverse Proxy for Leaderboard API

Use this when static files are served by NGINX and Node leaderboard backend runs on `127.0.0.1:3001`.

Ready-to-use sample in repo:

- `deploy/nginx/web-minigame-factory.conf`

## 1) Upstream

```nginx
upstream mgp_leaderboard_backend {
    server 127.0.0.1:3001;
    keepalive 64;
}
```

## 2) API Proxy (`/api`)

```nginx
# Normal API routes
location /api/ {
    proxy_pass http://mgp_leaderboard_backend;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 3s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;

    # Small JSON payloads only
    client_max_body_size 256k;
}
```

## 3) SSE route optimization (`/api/leaderboard/events`)

```nginx
location = /api/leaderboard/events {
    proxy_pass http://mgp_leaderboard_backend/api/leaderboard/events;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;

    add_header Cache-Control "no-cache" always;
    add_header X-Accel-Buffering "no" always;
}
```

## 4) Verify

```bash
sudo nginx -t
sudo systemctl reload nginx

curl -i http://YOUR_HOST/api/health
curl -N http://YOUR_HOST/api/leaderboard/events
```

Expected:

- `/api/health` returns `200` JSON with `ok: true`.
- `/api/leaderboard/events` keeps connection open and returns `event: ready`.

## 5) Optional public URL override in frontend

If API domain differs from web domain, set:

```js
window.__MGP_LEADERBOARD_API_BASE__ = 'https://api.example.com';
```

or browser local key:

`localStorage.setItem('mgp_leaderboard_api_base', 'https://api.example.com')`
