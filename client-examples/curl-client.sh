#!/bin/bash
#
# cURL mTLS Client Example
# Tests the mTLS endpoint with client certificate authentication
#

set -e

# Configuration
HOST="mtls.nietst.uk"
ENDPOINT="/api/certs"
CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Certificate paths
CLIENT_CERT="$CERT_DIR/client-cert.pem"
CLIENT_KEY="$CERT_DIR/client-key.pem"
CA_CERT="$CERT_DIR/ca.pem"

echo ""
echo "🔐 mTLS Client (cURL) - Testing $HOST$ENDPOINT"
echo ""

# Verify certificates exist
if [ ! -f "$CLIENT_CERT" ]; then
    echo "❌ Error: Client certificate not found: $CLIENT_CERT"
    exit 1
fi

if [ ! -f "$CLIENT_KEY" ]; then
    echo "❌ Error: Client key not found: $CLIENT_KEY"
    exit 1
fi

if [ ! -f "$CA_CERT" ]; then
    echo "❌ Error: CA certificate not found: $CA_CERT"
    exit 1
fi

echo "✓ Certificate files found"
echo "  - Client: $CLIENT_CERT"
echo "  - Key:    $CLIENT_KEY"
echo "  - CA:     $CA_CERT"
echo ""

# Make request with verbose output
echo "📤 Making request..."
echo ""

curl -v \
  --cert "$CLIENT_CERT" \
  --key "$CLIENT_KEY" \
  --cacert "$CA_CERT" \
  "https://$HOST$ENDPOINT" \
  2>&1 | tee /tmp/mtls-response.txt

echo ""
echo ""

# Check response
if grep -q '"mtls_valid":true' /tmp/mtls-response.txt; then
    echo "✅ mTLS Authentication: SUCCESS"
elif grep -q '"mtls_valid":false' /tmp/mtls-response.txt; then
    echo "❌ mTLS Authentication: FAILED"
    echo "   No valid client certificate was presented"
else
    echo "⚠️  Could not determine mTLS status"
fi

echo ""
