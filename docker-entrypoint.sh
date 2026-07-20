#!/bin/sh
set -e

# All persistent state lives here (mounted volume in Coolify).
DATA_DIR="${DATA_DIR:-/data}"
export DATA_DIR

mkdir -p "$DATA_DIR"

# Initialize the SQLite schema ONLY on first boot. initDb.js drops and recreates
# every table, so we must never run it when a database already exists — doing so
# would wipe live data on a restart/redeploy.
if [ ! -f "$DATA_DIR/database.sqlite" ]; then
  echo "[entrypoint] No database found at $DATA_DIR/database.sqlite — initializing schema..."
  node initDb.js
else
  echo "[entrypoint] Existing database found at $DATA_DIR/database.sqlite — skipping init."
fi

echo "[entrypoint] Starting server (DATA_DIR=$DATA_DIR)..."
exec node server.js
