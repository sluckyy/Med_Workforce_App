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
RUN apk add --no-cache openssl
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
EXPOSE 8000
# Applies any pending migration before the app starts, so a fresh
# environment (e.g. first Azure deployment) comes up with a real schema
# rather than requiring a manual migration step.
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/server.js"]
