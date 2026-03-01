# Let's Encrypt Certificate Setup

This guide covers the automatic Let's Encrypt certificate issuance and renewal system for `mtls.nietst.uk`.

## Quick Start

### Initial Setup (Staging)

1. **Install dependencies**:
   ```bash
   make install-acme
   ```

2. **Issue test certificate from Let's Encrypt staging**:
   ```bash
   make issue-cert
   ```

   This will:
   - Generate a new RSA 2048 server private key
   - Create a certificate order via Let's Encrypt staging API
   - Create a DNS TXT record `_acme-challenge.mtls.nietst.uk` for validation
   - Wait for DNS propagation (~5-30 seconds)
   - Verify the challenge
   - Save the certificate to `letsencrypt/cert.pem` and key to `letsencrypt/key.pem`
   - Copy both to project root as `cert.pem` and `key.pem`
   - Delete the validation DNS record

3. **Verify the certificate**:
   ```bash
   make check-cert
   ```

   Expected output (staging):
   ```
   notBefore=... notAfter=...
   subject=CN = mtls.nietst.uk, O = mTLS Server, C = US
   issuer=C = US, O = (STAGING) Let's Encrypt, CN = (STAGING) Artificial Apricot R3
   ```

### Switch to Production (When Ready)

Once you've verified the staging setup works:

```bash
make issue-cert-prod
```

This uses the production Let's Encrypt directory and will issue real certificates recognized by browsers.

## Renewal

### Manual Renewal

Check expiry and renew if within 30 days:
```bash
make renew-cert
```

Force renewal regardless of expiry:
```bash
make renew-cert-force
```

### Automatic Renewal (Windows Task Scheduler)

Set up a scheduled task to check for renewal weekly:

```bash
schtasks /create /tn "mtls-cert-renewal" `
  /tr "node C:\Users\wouter.bon\mtls-server\scripts\renew-cert.js" `
  /sc weekly /d MON /st 03:00 /f
```

This will:
- Check certificate expiry every Monday at 3:00 AM
- Renew if expiring within 30 days
- Kill and restart the server processes if renewal occurs

## Configuration

### Environment Variables

The scripts use the following from `.env`:

- `CLOUDFLARE_API_TOKEN` - For DNS record management
- `CLOUDFLARE_ACCOUNT` - For reference (not required by scripts)

**Required Permissions for `CLOUDFLARE_API_TOKEN`**:
- Zone: DNS:Edit
- Zone ID: `9b9e2119bd8cf84887e5eaa68fcbe58e` (nietst.uk)

### Key Files

| File | Purpose |
|------|---------|
| `cert.pem` | Server certificate (full chain) |
| `key.pem` | Server private key |
| `letsencrypt/account.json` | ACME account key (DO NOT COMMIT) |
| `letsencrypt/cert.pem` | Staging/prod certificate |
| `letsencrypt/key.pem` | Server private key backup |
| `letsencrypt/fullchain.pem` | Full certificate chain |

**Important**: Never commit `letsencrypt/` directory or `.env` to git. Both are in `.gitignore`.

## Architecture

### DNS-01 Challenge Flow

1. **ACME Order**: Request certificate for `mtls.nietst.uk`
2. **Challenge**: Receive DNS-01 challenge token
3. **DNS Record**: Create `_acme-challenge.mtls.nietst.uk` TXT record
4. **Propagation**: Wait for DNS to propagate globally
5. **Verification**: Let's Encrypt verifies the record
6. **Issuance**: Certificate is issued
7. **Cleanup**: Delete validation DNS record
8. **Deployment**: Copy cert/key to project root

### TLS Configuration

**Before (Test Certificates)**:
```yaml
originRequest:
  noTLSVerify: true
  # Accepts any certificate, including self-signed
```

**After (Let's Encrypt)**:
```yaml
originRequest:
  originServerName: mtls.nietst.uk
  noTLSVerify: false
  # Validates certificate matches origin server name
```

## Troubleshooting

### DNS Record Not Created

**Error**: `HTTP 403: Forbidden`

**Cause**: `CLOUDFLARE_API_TOKEN` missing DNS:Edit permission

**Solution**:
1. Go to Cloudflare Dashboard → API Tokens
2. Create token with scopes:
   - Zone → DNS:Edit
   - Zone → Zone:Read (for zone lookup)
3. Copy token to `.env` as `CLOUDFLARE_API_TOKEN`

### DNS Propagation Timeout

**Error**: `DNS propagation timeout (continuing anyway)`

**Cause**: DNS not visible within 60 seconds

**Solution**: The script continues anyway. If challenge fails, check:
1. DNS record was created (check Cloudflare UI)
2. DNS is resolving: `nslookup _acme-challenge.mtls.nietst.uk`
3. TXT record value matches challenge (use `dig` to verify)

### Certificate Verification Failed

**Error**: `Challenge verification timeout`

**Cause**: Let's Encrypt could not verify DNS record

**Solution**:
1. Ensure DNS record is properly created
2. Wait 30+ seconds before retry
3. Check with: `dig +short TXT _acme-challenge.mtls.nietst.uk`

### Server Won't Start After Renewal

**Cause**: `key.pem` or `cert.pem` missing or malformed

**Solution**:
1. Check files exist:
   ```bash
   ls -la cert.pem key.pem
   ```
2. Verify certificate:
   ```bash
   openssl x509 -in cert.pem -text -noout
   ```
3. If broken, manually run:
   ```bash
   make issue-cert
   ```

## Scripts Reference

### `scripts/issue-cert.js`

Issues or renews a certificate.

**Usage**:
```bash
node scripts/issue-cert.js [--production]
```

**Options**:
- (no args): Use Let's Encrypt staging
- `--production`: Use production directory

**Output**:
- `letsencrypt/account.json` - ACME account (created once)
- `letsencrypt/key.pem` - Server private key
- `letsencrypt/cert.pem` - Certificate only
- `letsencrypt/fullchain.pem` - Certificate + chain
- `cert.pem` - Copied from fullchain
- `key.pem` - Copied from letsencrypt/key.pem

### `scripts/renew-cert.js`

Checks certificate expiry and renews if needed.

**Usage**:
```bash
node scripts/renew-cert.js [--force]
```

**Options**:
- (no args): Check expiry, only renew if <30 days
- `--force`: Renew regardless of expiry

**Behavior**:
1. Parse expiry from `cert.pem`
2. If renewal needed: run `issue-cert.js`
3. Kill and restart `mtls-server.exe` and `cloudflared.exe`
4. User must restart processes manually or via automation

## Cloudflare Configuration

The tunnel configuration automatically uses `mtls.nietst.uk` as the origin server name for both hostnames:

```yaml
ingress:
  - hostname: mtls.nietst.uk
    service: https://localhost:9443
    originRequest:
      originServerName: mtls.nietst.uk
      noTLSVerify: false
  - hostname: nietst.uk
    service: https://localhost:9443
    originRequest:
      originServerName: mtls.nietst.uk
      noTLSVerify: false
```

This means:
- Both `mtls.nietst.uk` and `nietst.uk` route to the Rust server on port 9443
- cloudflared validates the certificate matches `mtls.nietst.uk`
- TLS verification is enabled (`noTLSVerify: false`)

## Security Notes

### Account Key

The ACME account private key is stored in `letsencrypt/account.json`. This is:
- Required for certificate renewal (tied to Let's Encrypt account)
- Sensitive but not as critical as the server key
- Should be backed up securely
- Never commit to git

### Server Private Key

The `key.pem` file is:
- The actual TLS private key
- Critical for security
- Should be protected with restrictive file permissions
- Automatically excluded from git via `.gitignore`

### Let's Encrypt Staging vs Production

- **Staging**: Rate-limited gently, good for testing
- **Production**: Rate-limited strictly (50 certificates per domain per week)

Always test with staging first before switching to production.

## Next Steps

1. Run `make issue-cert` to get test certificate
2. Verify with `make check-cert`
3. When ready, run `make issue-cert-prod` for production
4. Update cloudflared config is already done - just restart tunnel
5. Optionally set up Windows Task Scheduler for auto-renewal

## References

- Let's Encrypt Documentation: https://letsencrypt.org/docs/
- ACME Protocol (RFC 8555): https://tools.ietf.org/html/rfc8555
- Cloudflare DNS API: https://developers.cloudflare.com/api/operations/dns-records-create-dns-record
- acme-client npm package: https://github.com/publishlab/node-acme-client
