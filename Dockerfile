# 1: Frontend build (locales live in backend/, shared with the API)
FROM node:26-alpine AS build-frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
COPY backend/locales /app/backend/locales
RUN npm run build

# 2: Backend build
# better-sqlite3 and argon2 are native modules: when no prebuilt binary matches
# the running Node ABI they fall back to node-gyp, which needs this toolchain.
# It never reaches the final image, which only receives the built output.
FROM node:26-alpine AS build-backend
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend ./
RUN npm run build && npm prune --omit=dev

# 3: Final image, nginx + Node.js
FROM node:26-alpine
WORKDIR /app

# Filled in by a publish workflow (the resolved tag and the commit it built
# from) — a container can't otherwise know its own image tag from the inside.
# Left as "dev" for a plain local `docker build`. Shown on the admin panel's System page.
ARG APP_IMAGE_REF=dev
ARG APP_IMAGE_REVISION=
ENV APP_IMAGE_REF=$APP_IMAGE_REF \
    APP_IMAGE_REVISION=$APP_IMAGE_REVISION

LABEL org.opencontainers.image.source="https://github.com/PixlGalaxy/PixlBank" \
      org.opencontainers.image.title="PixlBank" \
      org.opencontainers.image.description="Self-hosted personal lending tracker: loans, interest, payment schedules, AI-verified receipts and email reminders." \
      org.opencontainers.image.licenses="MIT"

# tzdata so TZ in .env sets the calendar day used for due dates and reminders.
RUN apk add --no-cache nginx tini tar tzdata

COPY --from=build-frontend /app/frontend/dist /usr/share/nginx/html
COPY --from=build-backend /app/backend/dist /app/backend/dist
COPY --from=build-backend /app/backend/node_modules /app/backend/node_modules
COPY --from=build-backend /app/backend/package.json /app/backend/package.json
COPY backend/locales /app/backend/locales

COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production \
    PORT=4000 \
    DATA_ROOT=/data \
    LOCALES_DIR=/app/backend/locales \
    LANGUAGE=en

# The database, avatars and every payment receipt live here — back it up.
VOLUME ["/data"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini as PID 1 so signals and zombie processes are handled properly.
ENTRYPOINT ["tini", "--", "/entrypoint.sh"]
