#!/bin/sh
set -e

mkdir -p /run/clamav

# clamd starts from the database baked into the image at build time, so a
# cold start never blocks on a signature download. freshclam --daemon
# refreshes that database in the background once the server is already
# up — if it can't reach the update mirror (e.g. restricted egress),
# clamd keeps serving whatever was baked in rather than scanning becoming
# unavailable or the container failing to start. clamd's own SelfCheck
# picks up a refreshed database on its own; nothing here restarts it.
clamd --config-file=/etc/clamav/clamd.conf &
freshclam --config-file=/etc/clamav/freshclam.conf --daemon &

npx prisma migrate deploy --schema prisma/schema.prisma
exec node dist/server.js
