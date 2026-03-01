#!/usr/bin/env python3
"""
Python mTLS Client Example
Tests the mTLS endpoint with client certificate authentication

Requires: pip install requests
"""

import requests
import json
import sys
from pathlib import Path

# Configuration
BASE_URL = 'https://mtls.nietst.uk'
ENDPOINT = '/api/certs'
CERT_DIR = Path(__file__).parent.parent

# Certificate paths
CLIENT_CERT = (
    str(CERT_DIR / 'client-cert.pem'),  # cert file
    str(CERT_DIR / 'client-key.pem'),   # key file
)
CA_CERT = str(CERT_DIR / 'ca.pem')

print(f"\n🔐 mTLS Client - Connecting to {BASE_URL}{ENDPOINT}\n")

try:
    # Make request with client certificate
    response = requests.get(
        f"{BASE_URL}{ENDPOINT}",
        cert=CLIENT_CERT,           # Client certificate tuple (cert, key)
        verify=CA_CERT,             # CA certificate for verification
        timeout=10
    )

    print(f"✅ Status: {response.status_code}")
    print(f"📋 Headers: {dict(response.headers)}\n")

    try:
        data = response.json()
        print("📄 Response:")
        print(json.dumps(data, indent=2))
        print()

        if data.get('mtls_valid'):
            print("✅ mTLS Authentication: SUCCESS")
        else:
            print("❌ mTLS Authentication: FAILED")
            if data.get('presented_certificates'):
                print(f"   Certificates presented: {len(data['presented_certificates'])}")
            if data.get('verified_chains'):
                print(f"   Verified chains: {len(data['verified_chains'])}")

    except json.JSONDecodeError:
        print("📄 Response (raw):")
        print(response.text)

except requests.exceptions.SSLError as e:
    print(f"❌ SSL/TLS Error: {e}")
    print("\nTroubleshooting:")
    print("1. Verify certificates exist:")
    print(f"   - {CLIENT_CERT[0]}")
    print(f"   - {CLIENT_CERT[1]}")
    print(f"   - {CA_CERT}")
    print("2. Check certificate validity:")
    print("   openssl x509 -in client-cert.pem -text -noout")
    print("3. Verify mTLS policy is active in Cloudflare Access")
    sys.exit(1)

except requests.exceptions.ConnectionError as e:
    print(f"❌ Connection Error: {e}")
    print("\nTroubleshooting:")
    print("1. Check mtls.nietst.uk DNS resolution:")
    print("   nslookup mtls.nietst.uk")
    print("2. Verify Cloudflare Tunnel is running:")
    print("   cloudflared tunnel status")
    print("3. Ensure network allows outbound to Cloudflare")
    sys.exit(1)

except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
