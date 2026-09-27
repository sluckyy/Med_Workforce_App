FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json ./
COPY packages/canonical-model/package.json packages/canonical-model/package.json
COPY services/api/package.json services/api/package.json
RUN npm install --workspaces --if-present
COPY packages/canonical-model packages/canonical-model
COPY services/api services/api
RUN npm run prisma:generate --workspace services/api
RUN npm run build --workspace services/api

FROM node:20-alpine
WORKDIR /app
COPY --from=build /repo/services/api/dist ./dist
COPY --from=build /repo/services/api/node_modules ./node_modules
COPY --from=build /repo/services/api/prisma ./prisma
EXPOSE 8000
CMD ["node", "dist/server.js"]
