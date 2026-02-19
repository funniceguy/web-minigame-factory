# NGINX Cache Control (web-minigame-factory)

If users keep seeing old game HTML after deploy, apply cache headers on NGINX.

Use this as a baseline for `http://168.107.60.59/web-minigame-factory/`:

```nginx
# HTML entry + registries + runtime hub: always revalidate
location = /web-minigame-factory/ {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
}

location ~ ^/web-minigame-factory/src/(platform/GameHub\.js|html/registry\.json|jsx/registry\.json)$ {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
}

# Game source files: short cache + mandatory revalidation
location ~ ^/web-minigame-factory/src/(html|jsx)/.+\.(html|js|jsx)$ {
    add_header Cache-Control "public, max-age=60, must-revalidate" always;
}
```

After applying config:

1. `sudo nginx -t`
2. `sudo systemctl reload nginx`
3. Re-check headers:
   - `curl -I http://168.107.60.59/web-minigame-factory/`
   - `curl -I http://168.107.60.59/web-minigame-factory/src/platform/GameHub.js`
   - `curl -I http://168.107.60.59/web-minigame-factory/src/html/neon_biztycoon.html`

## Project-side validation

Use the built-in remote verification script:

```bash
npm run check:remote
```

Optional base URL:

```bash
node ./scripts/check-remote-deploy.mjs http://your-host/web-minigame-factory
```
