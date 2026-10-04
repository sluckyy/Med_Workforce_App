# Builds from the monorepo root so npm workspace hoisting resolves correctly
# (see docker-compose.yml / .github/workflows, which pass `.` as the context).
FROM node:20-alpine AS build
# Prisma's engine binaries are dynamically linked against OpenSSL, which
# Alpine's node image does not ship by default.
RUN apk add --no-cache openssl
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/canonical-model/package.json packages/canonical-model/package.json
COPY services/api/package.json services/api/package.json
RUN npm ci
# Guarantees this path exists even if a future dependency change removes
# every nested package, so the runtime stage's COPY below never fails.
RUN mkdir -p services/api/node_modules
COPY packages/canonical-model packages/canonical-model
COPY services/api services/api
RUN npm run prisma:generate --workspace services/api
RUN npm run build --workspace services/api

FROM node:20-alpine
# clamav pulls in clamd (clamav-daemon), clamscan/sigtool
# (clamav-scanner) and freshclam transitively — listed explicitly anyway
# since start.sh depends directly on all three being present.
RUN apk add --no-cache openssl clamav freshclam
WORKDIR /app
# npm workspaces hoist most dependencies to the repo root, so the runtime
# image needs that whole tree. This also keeps the `prisma` CLI binary
# available for `prisma migrate deploy` at container start below. A
# package can still end up nested under services/api/node_modules instead
# of hoisted (npm's dedupe rules nest a dependency when a conflicting
# version of one of ITS OWN dependencies already sits at the root — e.g.
# @fastify/multipart nested because of @fastify/busboy), so that directory
# is copied on top of (merged into) the root one rather than skipped.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/services/api/node_modules ./node_modules
COPY --from=build /repo/services/api/dist ./dist
COPY --from=build /repo/services/api/prisma ./prisma
COPY --from=build /repo/services/api/package.json ./package.json
COPY services/api/docker/clamd.conf /etc/clamav/clamd.conf
COPY services/api/docker/freshclam.conf /etc/clamav/freshclam.conf
COPY services/api/docker/start.sh ./start.sh
RUN chmod +x ./start.sh && mkdir -p /var/lib/clamav /run/clamav \
  # Bakes a signature database into the image so clamd never blocks
  # startup on a cold download; `|| true` because a build-time network
  # hiccup against the mirror shouldn't fail the whole image build — the
  # container-start freshclam (see start.sh) gets another attempt, and
  # clamd degrades to "unavailable" (modules/passport/scan.ts), not a
  # crash loop, if no database is present at all.
  && (freshclam --config-file=/etc/clamav/freshclam.conf || true)
EXPOSE 8000
# Migration + AV daemon startup now needs more than a one-line CMD — see
# start.sh. clamd and freshclam run as background children of this
# script; the final `exec node` replaces the script's own process image
# (so Node becomes PID 1) without killing those already-started children.
CMD ["./start.sh"]
