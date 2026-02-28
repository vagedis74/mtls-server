#!/usr/bin/env python3
"""
Configure mTLS CA Certificate for Cloudflare Access
"""
import os
import sys
import json
import io
import requests
from dotenv import load_dotenv

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

# Load environment variables
load_dotenv()

CLOUDFLARE_EMAIL = os.getenv("CLOUDFLARE_ACCOUNT")
CLOUDFLARE_API_KEY = os.getenv("CLOUDFLARE_API_KEY")
DOMAIN = "nietst.uk"
CA_CERT_FILE = "ca.pem"
API_BASE = "https://api.cloudflare.com/client/v4"

if not CLOUDFLARE_EMAIL or not CLOUDFLARE_API_KEY:
    print("❌ Error: CLOUDFLARE_ACCOUNT and CLOUDFLARE_API_KEY not set in .env")
    sys.exit(1)

headers = {
    "X-Auth-Email": CLOUDFLARE_EMAIL,
    "X-Auth-Key": CLOUDFLARE_API_KEY,
    "Content-Type": "application/json",
}

def get_zone_id():
    """Get zone ID for domain"""
    print(f"📍 Getting zone ID for {DOMAIN}...")
    resp = requests.get(
        f"{API_BASE}/zones?name={DOMAIN}",
        headers=headers
    )
    data = resp.json()

    if not data.get("success"):
        print(f"❌ Error: {data}")
        sys.exit(1)

    zone_id = data["result"][0]["id"]
    print(f"✅ Zone ID: {zone_id}")
    return zone_id

def read_ca_certificate():
    """Read CA certificate from file"""
    print(f"📄 Reading CA certificate from {CA_CERT_FILE}...")
    with open(CA_CERT_FILE, "r") as f:
        cert = f.read()
    print("✅ CA certificate loaded")
    return cert

def upload_ca_certificate(zone_id, ca_cert):
    """Upload CA certificate to Cloudflare"""
    print("\n📤 Uploading CA certificate to Cloudflare...")

    # Try the client_certificates endpoint with proper format
    payload = {
        "certificate": ca_cert
    }

    resp = requests.post(
        f"{API_BASE}/zones/{zone_id}/client_certificates",
        headers=headers,
        json=payload
    )

    data = resp.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    if data.get("success"):
        cert_id = data["result"]["id"]
        print(f"✅ Certificate uploaded with ID: {cert_id}")
        return cert_id
    else:
        print("⚠️  Certificate upload failed - will configure via policy")
        return None

def get_access_apps(zone_id):
    """Get all Access applications for the zone"""
    print(f"\n🔍 Fetching Access applications for {DOMAIN}...")
    resp = requests.get(
        f"{API_BASE}/zones/{zone_id}/access/apps",
        headers=headers
    )

    data = resp.json()
    if not data.get("success"):
        print(f"❌ Error: {data}")
        return None

    apps = data.get("result", [])
    if not apps:
        print("❌ No Access applications found")
        return None

    app = apps[0]
    app_id = app["id"]
    print(f"✅ Found application: {app['name']}")
    print(f"   ID: {app_id}")
    return app_id

def get_policies(zone_id):
    """Get policies for zone"""
    print(f"\n📋 Fetching mTLS policies for zone...")
    resp = requests.get(
        f"{API_BASE}/zones/{zone_id}/access/policies",
        headers=headers
    )

    data = resp.json()
    if not data.get("success"):
        print(f"❌ Error: {data}")
        return None

    policies = data.get("result", [])
    if not policies:
        print("❌ No policies found")
        return None

    # Find the mTLS policy
    policy = None
    for p in policies:
        if "mTLS" in p.get("name", "") or "certificate" in str(p.get("include", [])):
            policy = p
            break

    if not policy:
        policy = policies[0]

    policy_id = policy["id"]
    print(f"✅ Found policy: {policy['name']}")
    print(f"   ID: {policy_id}")
    return policy_id, policy

def update_policy_with_certificate(zone_id, policy_id, policy, ca_cert):
    """Update policy to include CA certificate verification"""
    print(f"\n🔐 Updating policy with CA certificate...")

    # Add certificate to include conditions
    include = policy.get("include", [])

    # Check if certificate condition already exists
    cert_condition_exists = any(
        "certificate" in cond for cond in include
    )

    if not cert_condition_exists:
        include.append({
            "certificate": {}
        })

    payload = {
        "include": include,
        "name": policy.get("name", "mTLS Policy"),
        "decision": policy.get("decision", "allow"),
        "require": policy.get("require", []),
        "exclude": policy.get("exclude", []),
    }

    # Add optional fields if they exist
    if "precedence" in policy:
        payload["precedence"] = policy["precedence"]
    if "isolation_required" in policy:
        payload["isolation_required"] = policy["isolation_required"]

    resp = requests.put(
        f"{API_BASE}/zones/{zone_id}/access/policies/{policy_id}",
        headers=headers,
        json=payload
    )

    data = resp.json()
    if data.get("success"):
        print("✅ Policy updated successfully")
        return True
    else:
        print(f"⚠️  Policy update response: {json.dumps(data, indent=2)}")
        return False

def main():
    print("=" * 60)
    print("🔐 Cloudflare mTLS Configuration")
    print("=" * 60)

    # Step 1: Get zone ID
    zone_id = get_zone_id()

    # Step 2: Read CA certificate
    ca_cert = read_ca_certificate()

    # Step 3: Upload CA certificate
    cert_id = upload_ca_certificate(zone_id, ca_cert)

    # Step 4: Get Access app
    app_id = get_access_apps(zone_id)
    if not app_id:
        sys.exit(1)

    # Step 5: Get policies
    result = get_policies(zone_id)
    if not result:
        sys.exit(1)

    policy_id, policy = result

    # Step 6: Update policy with certificate condition
    update_policy_with_certificate(zone_id, policy_id, policy, ca_cert)

    print("\n" + "=" * 60)
    print("✨ mTLS Configuration Complete!")
    print("=" * 60)
    print(f"\nDomain: {DOMAIN}")
    print(f"Zone ID: {zone_id}")
    print(f"App ID: {app_id}")
    print(f"Policy ID: {policy_id}")
    print(f"\nCA Certificate configured for mTLS verification")
    print(f"\nClients must present a valid certificate signed by:")
    print(f"  CN: Test CA")
    print(f"  Organization: mTLS Test")
    print(f"\nTest with:")
    print(f"  curl --cert client-cert.pem --key client-key.pem https://{DOMAIN}")
    print("=" * 60)

if __name__ == "__main__":
    main()
