# Fix Network Access - Twingate Configuration

## Problem Identified

**Twingate VPN** is blocking/intercepting traffic to Cloudflare IPs, preventing the mTLS deployment from working.

## Solutions

### Option 1: Temporarily Disable Twingate (Quickest)

1. **Open Twingate application** on your system
2. **Disconnect from Twingate**
3. **Test connection**:
   ```bash
   curl --cert client-cert.pem --key client-key.pem https://nietst.uk/api/certs
   ```
4. **Re-enable Twingate** when done testing

### Option 2: Configure Twingate to Allow Cloudflare (Recommended)

1. **Open Twingate Dashboard/Settings**
2. **Add Split Tunnel/Bypass Rules**:
   - Add domain: `*.cloudflare.com`
   - Add domain: `*.cloudflared.com`
   - Add IP range: `198.41.0.0/16` (Cloudflare Anycast)
3. **Reconnect to Twingate**
4. **Test connection**:
   ```bash
   curl --cert client-cert.pem --key client-key.pem https://nietst.uk/api/certs
   ```

### Option 3: Disable Windows Firewall Blocking

If Twingate is disabled but still having issues:

1. **Open Windows Defender Firewall**
2. **Allow outbound HTTPS** (port 443)
3. **Allow outbound QUIC** (UDP port 443)

### Option 4: Manual Network Configuration

Run as Administrator:

```powershell
# Allow outbound HTTPS
netsh advfirewall firewall add rule name="Allow HTTPS" dir=out action=allow protocol=tcp remoteport=443

# Allow UDP (for QUIC)
netsh advfirewall firewall add rule name="Allow UDP 443" dir=out action=allow protocol=udp remoteport=443

# Flush DNS cache
ipconfig /flushdns

# Reset network
netsh int ip reset resetlog.txt
```

### Option 5: Use Local Testing Workaround

If you need to test without fixing network:

```bash
# Test local server directly
cd /c/Users/wouter.bon/mtls-server
./target/release/mtls-server

# In another terminal, test with openssl (not Windows curl)
openssl s_client -connect 127.0.0.1:9443 -cert client-cert.pem -key client-key.pem
```

## What's Happening

```
Your Request
    ↓
Twingate VPN (INTERCEPTING)
    ↓
Tries to route to Cloudflare
    ↓
BLOCKED (Twingate doesn't have route to CF)
    ↓
Connection Timeout
```

## Why It Matters

The **Cloudflare Tunnel is working correctly**, but traffic from your machine can't reach it because:
1. Twingate intercepts all traffic
2. Twingate doesn't have a route to Cloudflare IPs
3. Traffic gets dropped/blocked

## Recommended Fix

**Option 1 (Fastest for Testing)**:
- Temporarily disconnect Twingate
- Test the mTLS deployment
- Reconnect Twingate

**Option 2 (Permanent)**:
- Configure Twingate split tunneling
- Allow Cloudflare domains/IPs
- Keep Twingate connected while using mTLS

## Verification Steps

### After disabling Twingate:

```bash
# 1. Verify DNS works
nslookup nietst.uk

# 2. Test connectivity
curl -v https://nietst.uk

# 3. Test with client cert
curl --cert client-cert.pem --key client-key.pem https://nietst.uk/api/certs

# Expected response (200 OK with JSON)
```

### Expected Response (Success)

```json
{
  "mtls_valid": true,
  "presented_certificates": [],
  "verified_chains": [],
  "message": "mTLS certificate validation successful!",
  "timestamp": "2026-02-28T..."
}
```

### Expected Response (Blocked)

```
403 Forbidden
Cloudflare Access
```

## Twingate Bypass Domains

Add these to Twingate split tunneling:

```
*.cloudflare.com
*.cloudflared.com
*.workers.dev
*.tunnel.cloudflare.com
198.41.0.0/16
198.32.0.0/11
```

## Network Ports Required

For mTLS to work, allow outbound:

| Port | Protocol | Purpose | Required |
|------|----------|---------|----------|
| 443 | TCP | HTTPS/HTTP2 | ✅ Yes |
| 443 | UDP | QUIC | ✅ Yes |
| 53 | UDP | DNS | ✅ Yes |

## Troubleshooting

### "Connection refused"
- Server not running: Start `./target/release/mtls-server`
- Wrong port: Use 9443 for local, 443 for tunnel

### "Certificate not found"
- PEM format issue on Windows: Use `curl -k` to skip cert verification
- Or use: `curl -E client.p12` (PKCS12 format)

### "Timed out" (original issue)
- Twingate still blocking: Disable or configure bypass
- Check firewall: `netsh advfirewall show allprofiles`
- Verify route: `route print`

## After Fixing Network Access

Once network is fixed, test with:

```bash
curl -v --cert client-cert.pem --key client-key.pem https://nietst.uk/api/certs
```

This should immediately return a 200 OK with your mTLS response! ✅

---

**Status**: Network connectivity issue identified and solutions provided
**Next Step**: Apply one of the solutions above and test
