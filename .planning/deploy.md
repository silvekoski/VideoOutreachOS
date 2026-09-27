# Deploy

The tool runs on a Verda CPU instance, `86.38.238.174` (Ubuntu 26.04, location FIN-02). The public address is https://86.38.238.174.compute.verda.run.

## Flow

1. A push to `main` starts `.github/workflows/deploy.yml`.
2. The workflow connects to `root@VERDA_HOST` with the key in the `VERDA_SSH_KEY` secret.
3. On the server, `authorized_keys` forces this key to run `scripts/deploy.sh` only.
4. `deploy.sh` pulls `main`, installs, builds, installs `deploy/mergero.service`, and restarts the service.

## Server layout

| Item | Place |
|---|---|
| Repo | `/srv/mergero`, owned by the `mergero` user |
| Secrets | `/srv/mergero/.env`, copied by hand, not in git |
| Host settings | `/etc/mergero.env` (`PUBLIC_BASE_URL`, `ASIAKASTIETO_URL`) |
| Data | `/srv/mergero-data/storage` |
| Proxy | Caddy, `/etc/caddy/Caddyfile` |

The systemd environment has priority over `.env`, because Node does not replace a variable that is already set.

`ASIAKASTIETO_URL` points to `127.0.0.1`, because the password on the public address blocks the API call to its own mock.

## Access

Caddy gets the TLS certificate through ACME. `/v/*` and `/assets/*` are open. All other paths need basic auth with the user `admin`. The firewall (ufw) lets in ports 22, 80 and 443 only.

To change the password, run `caddy hash-password` on the server, put the hash in the Caddyfile, and run `systemctl reload caddy`.
