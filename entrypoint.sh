#!/bin/sh
set -e

# Start cloudflared in the background
echo "Starting cloudflared tunnel..."
cloudflared tunnel run --config /etc/cloudflared/config.yml &
CLOUDFLARED_PID=$!

# Give cloudflared time to connect
sleep 2

# Start the mTLS server
echo "Starting Rust mTLS server..."
/app/mtls-server

# If the server exits, kill cloudflared too
kill $CLOUDFLARED_PID 2>/dev/null || true
