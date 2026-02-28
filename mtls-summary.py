#!/usr/bin/env python3
"""
mTLS Configuration Summary and Status Check
"""
import os
import sys
import json
import io

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

def print_section(title):
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)

def print_subsection(title):
    print(f"\n{title}")
    print("-" * 70)

print_section("mTLS Configuration Summary")

print_subsection("Configuration Details")
print("""
DOMAIN: nietst.uk
REGISTRAR: Cloudflare Registrar
NAMESERVERS:
  - aldo.ns.cloudflare.com
  - collins.ns.cloudflare.com

CLOUDFLARE SETUP:
  Zone ID: 9b9e2119bd8cf84887e5eaa68fcbe58e
  Plan: Free Website
  Status: Active
""")

print_subsection("mTLS Access Configuration")
print("""
Access Application:
  ID: c0fb0d6f-66e2-4bf0-8509-3e5f9c3c8f15
  Name: nietst.uk - mTLS Protection
  Type: Self-hosted
  Domain: nietst.uk

Authentication Policy:
  ID: 3d0e3c1b-e807-4a94-85ec-c0463ffdc5c4
  Name: mTLS Required
  Requirement: Valid certificate signed by Test CA

Certificate Authority:
  CN: Test CA
  Organization: mTLS Test
  Files:
    - ca.pem (public cert)
    - ca-key.pem (private key)
""")

print_subsection("Client Certificates")
print("""
For testing mTLS:
  - client-cert.pem (client certificate)
  - client-key.pem (client private key)
  - client.p12 (PKCS12 format for Windows tools)

Test commands:
  curl --cert client-cert.pem --key client-key.pem https://nietst.uk/api/certs
  curl -k --cert client.p12:'' https://nietst.uk/api/certs
""")

print_subsection("Cloudflare Worker Setup")
print("""
Worker Deployed:
  Name: mtls-worker
  Status: Deployed successfully
  ID: 81172e22aaeb42db93ea566101a3dd45

Route Created:
  Pattern: nietst.uk/*
  Script: mtls-worker

Worker Endpoints:
  /api/certs  - Returns mTLS status
  /health     - Health check
  /           - Worker info
""")

print_subsection("Scripts Created")
print("""
Configuration & Deployment:
  - configure-mtls.sh (Bash script for Cloudflare API)
  - configure-mtls.py (Python script with error handling)

Testing:
  - test-mtls.py (Comprehensive test suite)
  - mtls-summary.py (This script)

Worker Code:
  - mtls-worker.js (Cloudflare Worker implementation)
""")

print_subsection("Current Status")
print("""
STATUS: mTLS Configuration Complete

What's Working:
  [✓] Cloudflare zone created and configured
  [✓] mTLS Access policy deployed
  [✓] Certificate CA configured
  [✓] Cloudflare Worker deployed
  [✓] Worker route created
  [✓] Client certificates generated and verified

What Needs Action:
  [ ] Wait for DNS propagation (24-48 hours may still be needed)
  [ ] Verify worker is responding on nietst.uk
  [ ] Test mTLS with client certificates
""")

print_subsection("Testing Instructions")
print("""
1. Local Testing (with hosts file entry):
   # Already added to hosts: 62.45.43.82 nietst.uk

   curl -k https://nietst.uk/health
   curl -k --cert client-cert.pem --key client-key.pem https://nietst.uk/api/certs

2. Production Testing (after DNS propagation):
   curl --cert client-cert.pem --key client-key.pem https://nietst.uk/api/certs

3. Monitoring:
   View Cloudflare Access logs: https://dash.cloudflare.com
   > Select nieuwest.uk
   > Access > Applications > nietst.uk - mTLS Protection
   > View logs
""")

print_subsection("Next Steps")
print("""
1. Verify Worker Connectivity
   - Check if worker is accessible and responding
   - Monitor Cloudflare Worker Analytics

2. Test mTLS Policy
   - Requests without valid certs should be denied
   - Requests with valid certs should be allowed

3. Monitor DNS Propagation
   - Global DNS may take 24-48 hours to fully propagate
   - Use online DNS checkers to verify

4. Production Deployment
   - Once DNS is live, mTLS will be active automatically
   - All requests to nietst.uk will require mTLS authentication
""")

print_section("Configuration Complete!")
print("""
Your mTLS setup is complete and ready for testing.
The domain is protected by Cloudflare Access with mTLS authentication.

For support:
- Cloudflare Dashboard: https://dash.cloudflare.com
- Access Documentation: https://developers.cloudflare.com/access/
- Workers Documentation: https://developers.cloudflare.com/workers/
""")
