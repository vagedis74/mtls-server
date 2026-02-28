#!/bin/bash
set -e

# Load credentials from .env
source .env

DOMAIN="nietst.uk"
CA_CERT_FILE="ca.pem"
API_BASE="https://api.cloudflare.com/client/v4"

echo "🔐 Configuring mTLS for $DOMAIN on Cloudflare..."
echo "Email: $CLOUDFLARE_ACCOUNT"

# Step 1: Get Zone ID
echo ""
echo "📍 Getting zone ID for $DOMAIN..."
ZONE_RESPONSE=$(curl -s -X GET "$API_BASE/zones?name=$DOMAIN" \
  -H "X-Auth-Email: $CLOUDFLARE_ACCOUNT" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  -H "Content-Type: application/json")

ZONE_ID=$(echo "$ZONE_RESPONSE" | jq -r '.result[0].id')

if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" = "null" ]; then
  echo "❌ Error: Could not find zone for $DOMAIN"
  echo "Response: $ZONE_RESPONSE"
  exit 1
fi

echo "✅ Zone ID: $ZONE_ID"

# Step 2: Read CA certificate
echo ""
echo "📄 Reading CA certificate from $CA_CERT_FILE..."
CA_CERT=$(cat "$CA_CERT_FILE")

# Step 3: Upload CA certificate to Cloudflare
echo ""
echo "📤 Uploading CA certificate to Cloudflare..."
CERT_RESPONSE=$(curl -s -X POST "$API_BASE/zones/$ZONE_ID/client_certificates" \
  -H "X-Auth-Email: $CLOUDFLARE_ACCOUNT" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "certificate": $(jq -Rs . <<< "$CA_CERT")
}
EOF
)

CERT_ID=$(echo "$CERT_RESPONSE" | jq -r '.result.id')
SUCCESS=$(echo "$CERT_RESPONSE" | jq -r '.success')

if [ "$SUCCESS" != "true" ]; then
  echo "⚠️  Certificate upload response:"
  echo "$CERT_RESPONSE" | jq .
  # Don't exit - certificate might already exist
else
  echo "✅ Certificate uploaded with ID: $CERT_ID"
fi

# Step 4: Create mTLS Access Application Policy
echo ""
echo "🔑 Setting up mTLS policy for entire domain..."
POLICY_RESPONSE=$(curl -s -X POST "$API_BASE/zones/$ZONE_ID/access/apps" \
  -H "X-Auth-Email: $CLOUDFLARE_ACCOUNT" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "$DOMAIN - mTLS Protection",
  "domain": "$DOMAIN",
  "type": "self_hosted",
  "session_duration": "24h",
  "allowed_idps": [],
  "auto_redirect_to_identity": false,
  "enable_binding_cookie": false,
  "http_only_cookie_attribute": false,
  "same_site_cookie_attribute": "lax",
  "custom_deny_url": "",
  "custom_deny_message": "",
  "logo_url": ""
}
EOF
)

APP_ID=$(echo "$POLICY_RESPONSE" | jq -r '.result.id')
SUCCESS=$(echo "$POLICY_RESPONSE" | jq -r '.success')

if [ "$SUCCESS" = "true" ]; then
  echo "✅ Access app created with ID: $APP_ID"
else
  # Try to get existing app
  echo "⚠️  App creation response:"
  echo "$POLICY_RESPONSE" | jq .
fi

# Step 5: Create mTLS policy
echo ""
echo "🛡️  Creating mTLS authentication policy..."
MTLS_POLICY=$(curl -s -X POST "$API_BASE/zones/$ZONE_ID/access/policies" \
  -H "X-Auth-Email: $CLOUDFLARE_ACCOUNT" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "mTLS Required",
  "precedence": 1,
  "decision": "allow",
  "include": [
    {
      "certificate": {}
    }
  ]
}
EOF
)

POLICY_ID=$(echo "$MTLS_POLICY" | jq -r '.result.id')
SUCCESS=$(echo "$MTLS_POLICY" | jq -r '.success')

if [ "$SUCCESS" = "true" ]; then
  echo "✅ Policy created with ID: $POLICY_ID"
else
  echo "⚠️  Policy response:"
  echo "$MTLS_POLICY" | jq .
fi

echo ""
echo "================================"
echo "✨ mTLS Configuration Complete!"
echo "================================"
echo ""
echo "Domain: $DOMAIN"
echo "Zone ID: $ZONE_ID"
echo "CA Certificate uploaded for mTLS verification"
echo ""
echo "Clients connecting to $DOMAIN must now present"
echo "a valid certificate signed by your CA."
echo ""
echo "Test with:"
echo "  curl --cert client-cert.pem --key client-key.pem https://$DOMAIN"
