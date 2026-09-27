#!/usr/bin/env bash
set -euo pipefail

main() {
  cd /srv/mergero
  runuser -u mergero -- git fetch --quiet origin main
  runuser -u mergero -- git reset --hard --quiet origin/main
  runuser -u mergero -- pnpm install --frozen-lockfile
  runuser -u mergero -- pnpm build
  install -m 644 deploy/mergero.service /etc/systemd/system/mergero.service
  systemctl daemon-reload
  systemctl enable --quiet mergero
  systemctl restart mergero
  sleep 5
  systemctl is-active mergero
  git log -1 --format='deployed %h %s'
}

main "$@"
