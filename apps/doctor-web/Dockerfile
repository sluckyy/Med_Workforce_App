# Doctor-facing PWA (static SPA served by nginx). Build from the monorepo
# root so npm workspace hoisting and the @med-workforce/canonical-model
# workspace dependency resolve correctly (see docker-compose.yml /
# .github/workflows, which pass `.` as the build context).
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/canonical-model/package.json packages/canonical-model/package.json
COPY apps/doctor-web/package.json apps/doctor-web/package.json
RUN npm ci
COPY packages/canonical-model packages/canonical-model
COPY apps/doctor-web apps/doctor-web
# VITE_API_BASE_URL is only a build-time fallback; the runtime value comes
# from the API_BASE_URL environment variable via /config.js (see docker/).
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build --workspace apps/doctor-web

FROM nginx:1.27-alpine
COPY apps/doctor-web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/doctor-web/docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /repo/apps/doctor-web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
