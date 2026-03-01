#!/usr/bin/env python3
"""Configure mTLS tunnel with Cloudflare API"""

import os
import json
import requests
import sys
from dotenv import load_dotenv

# Fix encoding on Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Load environment variables
load_dotenv()

CLOUDFLARE_API_TOKEN = os.getenv('CLOUDFLARE_API_TOKEN')
ACCOUNT_ID = os.getenv('CLOUDFLARE_ACCOUNT_ID', '')  # Will try to get from API if not set
ZONE_ID = '9b9e2119bd8cf84887e5eaa68fcbe58e'
TUNNEL_NAME = 'mTLS-Tunnel'
TUNNEL_ID = '2050906e-5e20-4896-8313-44a8fe994a9f'

BASE_URL = 'https://api.cloudflare.com/client/v4'
HEADERS = {
    'Authorization': f'Bearer {CLOUDFLARE_API_TOKEN}',
    'Content-Type': 'application/json'
}

def get_account_id():
    """Get account ID from Cloudflare API"""
    print("[*] Getting account ID...")
    resp = requests.get(f'{BASE_URL}/accounts', headers=HEADERS)
    if resp.status_code != 200:
        print(f"[!] Failed to get account ID: {resp.text}")
        return None
    accounts = resp.json()['result']
    if accounts:
        account_id = accounts[0]['id']
        print(f"[✓] Account ID: {account_id}")
        return account_id
    return None

def get_tunnel_token(account_id):
    """Get tunnel token from Cloudflare"""
    print(f"[*] Getting tunnel token for {TUNNEL_ID}...")
    resp = requests.get(
        f'{BASE_URL}/accounts/{account_id}/cfd_tunnel/{TUNNEL_ID}/token',
        headers=HEADERS
    )
    if resp.status_code != 200:
        print(f"[!] Failed to get tunnel token: {resp.text}")
        return None

    token = resp.json()['result']
    print(f"[✓] Got tunnel token: {token[:20]}...")
    return token

def create_credentials_file(account_id, token):
    """Create Cloudflare tunnel credentials file"""
    print("[*] Creating credentials file...")

    credentials = {
        "AccountTag": account_id,
        "TunnelSecret": token,
        "TunnelID": TUNNEL_ID,
        "TunnelName": TUNNEL_NAME
    }

    credentials_path = 'credentials.json'
    with open(credentials_path, 'w') as f:
        json.dump(credentials, f)

    print(f"[✓] Created {credentials_path}")
    return credentials_path

def verify_tunnel(account_id):
    """Verify tunnel exists and get details"""
    print(f"[*] Verifying tunnel {TUNNEL_ID}...")
    resp = requests.get(
        f'{BASE_URL}/accounts/{account_id}/cfd_tunnel/{TUNNEL_ID}',
        headers=HEADERS
    )
    if resp.status_code == 200:
        tunnel = resp.json()['result']
        print(f"[✓] Tunnel exists: {tunnel['name']}")
        print(f"    - ID: {tunnel['id']}")
        print(f"    - Created: {tunnel['created_at']}")
        return True
    else:
        print(f"[!] Tunnel not found: {resp.text}")
        return False

def check_dns_records(zone_id):
    """Check DNS records for the domain"""
    print("[*] Checking DNS records...")
    resp = requests.get(
        f'{BASE_URL}/zones/{zone_id}/dns_records',
        headers=HEADERS,
        params={'name': 'nietst.uk'}
    )
    if resp.status_code == 200:
        records = resp.json()['result']
        if records:
            print(f"[✓] Found {len(records)} DNS record(s):")
            for record in records:
                print(f"    - {record['type']} {record['name']} -> {record['content']}")
        else:
            print("[!] No DNS records found for nietst.uk")
    else:
        print(f"[!] Failed to get DNS records: {resp.text}")

def main():
    print("=" * 60)
    print("Cloudflare mTLS Tunnel Configuration")
    print("=" * 60)

    if not CLOUDFLARE_API_TOKEN:
        print("[!] CLOUDFLARE_API_TOKEN not found in .env file")
        sys.exit(1)

    # Step 1: Get account ID
    account_id = get_account_id()
    if not account_id:
        sys.exit(1)

    # Step 2: Verify tunnel exists
    if not verify_tunnel(account_id):
        sys.exit(1)

    # Step 3: Get tunnel token
    token = get_tunnel_token(account_id)
    if not token:
        sys.exit(1)

    # Step 4: Create credentials file
    creds_path = create_credentials_file(account_id, token)

    # Step 5: Check DNS records
    check_dns_records(ZONE_ID)

    print("\n" + "=" * 60)
    print("✓ Configuration complete!")
    print("=" * 60)
    print(f"\nNext steps:")
    print(f"1. Ensure credentials.json exists: {creds_path}")
    print(f"2. Run the Docker container:")
    print(f"   docker run -d \\")
    print(f"     -v $(pwd)/credentials.json:/etc/cloudflared/credentials.json:ro \\")
    print(f"     -p 9443:9443 \\")
    print(f"     --name mtls-tunnel \\")
    print(f"     mtls-server:rust")
    print(f"3. Check logs: docker logs -f mtls-tunnel")

if __name__ == '__main__':
    main()
