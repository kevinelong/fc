# apid — codeonline.io API daemon (third-party auth)

Self-hosted Node service on 127.0.0.1:8092, exposed as `codeonline.io/api/`.
Google (Identity Services, verify ID token) + GitHub (OAuth code flow).
Login is optional — it only unlocks saving + a nickname.

## Setup
1. `cd apid && npm install --omit=dev`   (node_modules is gitignored)
2. `cp .env.example .env && chmod 600 .env`, fill in credentials (see below).
3. Service (Alpine/OpenRC):
       doas cp apid/apid.openrc /etc/init.d/apid && doas chmod +x /etc/init.d/apid
       doas touch /var/log/apid.log && doas chown kevin:kevin /var/log/apid.log
       doas rc-service apid start && doas rc-update add apid default
4. nginx (codeonline.io server block):
       location /api/ { proxy_pass http://127.0.0.1:8092; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }

## Credentials (.env)
- GOOGLE_CLIENT_ID — Google Cloud → Credentials → OAuth client (Web).
  Authorized JavaScript origins: https://codeonline.io  (no secret needed; GIS verifies client-side, we verify the token).
- GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET — GitHub → Settings → Developer settings → OAuth Apps.
  Homepage: https://codeonline.io   Callback: https://codeonline.io/api/auth/github/callback
- Leave a provider blank to hide its button. Restart apid after editing: `doas rc-service apid restart`.

## Endpoints
GET /api/auth/{health,config,me}  ·  POST /api/auth/{google,nickname,logout}  ·  GET /api/auth/github/{start,callback}
Sessions: opaque httpOnly Secure SameSite=Lax cookie. State-changing POSTs require header `X-CO: 1` (CSRF guard).
Store: data/db.json (gitignored) — users, nickname index, sessions.
