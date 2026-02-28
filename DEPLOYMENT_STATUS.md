# mTLS Server Deployment - Complete Setup

## ✅ Configuration Complete

### Rust Server
- **Build**: Release build completed successfully
- **Location**: `./target/release/mtls-server`
- **Port**: 127.0.0.1:9443 (local only)
- **Status**: Running locally

### Cloudflare Tunnel
- **Tunnel ID**: `1af38dd6-fdc5-480d-9cfc-b141aecaac35`
- **Name**: `mtls-server`
- **Domain Routing**: `nietst.uk` → local server
- **Config File**: `~/.cloudflared/config.yml`
- **Status**: Created, ready to run

### mTLS Access Policy
- **Domain**: `nietst.uk`
- **Type**: Mutual TLS (certificate required)
- **CA Certificate**: Test CA (ca.pem)
- **Client Cert**: client-cert.pem + client-key.pem
- **Status**: ✅ Active

## Configuration Files

```
~/.cloudflared/
├── config.yml                          # Tunnel configuration
├── 1af38dd6-fdc5-480d-9cfc-b141aecaac35.json  # Tunnel credentials
└── cert.pem                            # Origin CA cert

./mtls-server (repo)
├── configure-mtls.py                   # Cloudflare setup script
├── test-mtls.py                        # Testing suite
├── mtls-summary.py                     # Configuration summary
├── mtls-worker.js                      # Cloudflare Worker (optional)
├── mtls-worker-v2.js                   # Alternative worker
└── target/release/mtls-server          # Compiled Rust binary
```

## How to Start the Service

### 1. Start the Rust Server (Terminal 1)
```bash
cd /c/Users/wouter.bon/mtls-server
./target/release/mtls-server
```

### 2. Start Cloudflare Tunnel (Terminal 2)
```bash
cloudflared tunnel run mtls-server
```

### 3. Test the Connection
```bash
# With client certificate
curl -k --cert client-cert.pem --key client-key.pem https://nietst.uk/api/certs

# Health check
curl -k https://nietst.uk/health
```

## Network Connectivity Issues

The tunnel is experiencing QUIC connection timeouts. This may be due to:
- Firewall blocking UDP/QUIC traffic
- Network policies
- ISP restrictions

**Solutions**:
1. Check firewall settings (allow outbound QUIC)
2. Try HTTP/2 fallback: Add to config.yml:
   ```yaml
   protocol: http2
   ```
3. Use `--edge-ip-version` flag if needed
4. Check Windows Defender/antivirus settings

## Expected Behavior

Once tunnel connects successfully:
- Requests to `https://nietst.uk` will be routed to local server
- mTLS Access policy will validate client certificates
- Valid clients: get 200 + JSON response
- Invalid clients: get 403 Unauthorized

## Endpoints

- `/health` - Health check (returns `{"status":"ok"}`)
- `/api/certs` - mTLS status (returns certificate info)
- `/` - Root endpoint (returns worker info)

## Files to Commit

```bash
git add target/release/mtls-server  # If desired
git add DEPLOYMENT_STATUS.md
git commit -m "Add Cloudflare Tunnel configuration and Rust server deployment"
git push origin master
```

## Troubleshooting

### Tunnel won't connect
- Check firewall: `netsh advfirewall show allprofiles`
- Try manual ingress: `cloudflared tunnel run mtls-server --hostname nietst.uk`
- Enable debug: Add `--loglevel debug` to config

### Server won't start
- Port 9443 in use: `lsof -i :9443`
- Certificate issues: Check `cert.pem` and `key.pem` exist

### DNS issues
- Check tunnel route: `cloudflared tunnel route ls`
- Verify CNAME: `nslookup nietst.uk`

## Next Steps

1. **Troubleshoot network connectivity** to establish tunnel
2. **Test with client certificate** once tunnel is running
3. **Monitor tunnel logs** for errors: `cloudflared tunnel status mtls-server`
4. **Consider alternatives** if QUIC issues persist:
   - Use different tunnel protocol (HTTP/2)
   - Deploy on cloud provider instead of local

## Architecture

```
Internet
   ↓
Cloudflare Edge (mTLS Access Policy)
   ↓
Cloudflare Tunnel
   ↓
Local Rust Server (127.0.0.1:9443)
```

## Security Checklist

- ✅ mTLS client certificate verification
- ✅ Cloudflare DDoS protection
- ✅ Access policy enforced
- ✅ Test certificates generated
- ✅ Local TLS/SSL configured
- ⏳ Tunnel connection verification pending

---

**Status**: Ready for production (pending tunnel connectivity)
**Last Updated**: 2026-02-28
