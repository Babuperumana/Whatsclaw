# syntax=docker/dockerfile:1

# Single-stage build on full bookworm (not slim) to avoid OOM during
# native builds (sqlite3 + Baileys) and to skip the apt-get toolchain step.
FROM node:22-bookworm

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data

WORKDIR /app

# Install production deps against the lockfile for reproducible builds.
# Coolify injects its own DEPLOY_CACHEBUST ARG which would prevent npm ci
# from re-running, so we also ADD a commit-based dummy file to guarantee
# the install layer is invalidated whenever the source changes.
COPY package.json package-lock.json ./
# cache-bust: 2026-08-09-v3
ADD cache-bust.txt /tmp/cache-bust.txt
# Install C/C++ toolchain for native module builds (sqlite3, bcrypt) on ARM64 hosts
# where prebuilt binaries may not be available for the correct architecture.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN npm_config_build_from_source=sqlite3,bcrypt npm ci --omit=dev

# Application source (adds the cache-bust marker above + everything else).
COPY . .

# Entrypoint that bootstraps the DB on first boot then launches the server.
RUN chmod +x docker-entrypoint.sh

# Persistent state (SQLite DB, WhatsApp auth, JWT secret) is mounted here.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

# Run as node (matches the existing /data volume ownership from prior runs).
USER node

EXPOSE 3001

# Lightweight liveness check against the login page (no auth required).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3001)+'/login',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
