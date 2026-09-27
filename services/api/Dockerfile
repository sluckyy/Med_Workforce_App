# Builds from the monorepo root so npm workspace hoisting resolves correctly
# (see docker-compose.yml / .github/workflows, which pass `.` as the context).
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/canonical-model/package.json packages/canonical-model/package.json
COPY services/api/package.json services/api/package.json
RUN npm ci
COPY packages/canonical-model packages/canonical-model
COPY services/api services/api
RUN npm run prisma:generate --workspace services/api
RUN npm run build --workspace services/api

FROM node:20-alpine
WORKDIR /app
# npm workspaces hoist all dependencies to the repo root, so the runtime
# image needs that whole tree, not services/api/node_modules (which npm
# never creates in this layout). This also keeps the `prisma` CLI binary
# available for `prisma migrate deploy` at container start below.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/services/api/dist ./dist
COPY --from=build /repo/services/api/prisma ./prisma
COPY --from=build /repo/services/api/package.json ./package.json
EXPOSE 8000
# Applies any pending migration before the app starts, so a fresh
# environment (e.g. first Azure deployment) comes up with a real schema
# rather than requiring a manual migration step.
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/server.js"]
