# syntax=docker/dockerfile:1

# ---- Builder: compile native deps (sqlite3, Baileys) ----
FROM node:22-bookworm-slim AS builder

# Toolchain needed for node-gyp native builds.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production deps against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
ARG DEPLOY_CACHEBUST=2026-07-26-3
RUN npm_config_build_from_source=sqlite3 npm ci --omit=dev

# ---- Runtime ----
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data

WORKDIR /app

# Bring in compiled node_modules from the builder.
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

# Application source.
COPY --chown=node:node . .

# Entrypoint that bootstraps the DB on first boot then launches the server.
RUN chmod +x docker-entrypoint.sh

# Persistent state (SQLite DB, WhatsApp auth, JWT secret) is mounted here.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

# Drop root.
USER node

EXPOSE 3001

# Lightweight liveness check against the login page (no auth required).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3001)+'/login',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
