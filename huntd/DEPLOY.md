# huntd deploy (hunt-clone spike)

Generic per-room websocket relay for fc multiplayer. Runs on 127.0.0.1:8090,
exposed to browsers as `wss://codeonline.io/relay`.

## Service (Alpine / OpenRC)
    cd huntd && npm install --omit=dev   # node_modules is gitignored
    doas cp huntd/huntd.openrc /etc/init.d/huntd
    doas chmod +x /etc/init.d/huntd
    doas touch /var/log/huntd.log && doas chown kevin:kevin /var/log/huntd.log
    doas rc-service huntd start
    doas rc-update add huntd default        # survive reboot

## nginx (add to the codeonline.io server block)
    location /relay {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

## fc client (planned)
    join game "hunt" room "abc"      -- connect (wss://<host>/relay?game=&room=)
    broadcast {x: player.x, y: player.y}
    each peer in peers ...           -- runtime-maintained from incoming state

Verified: two clients over wss exchange welcome/join/state.
