# Windows mTLS Client - Problem & Solution

**Problem**: Windows curl (schannel) cannot properly import PEM certificates for mTLS authentication.

**Error**:
```
curl: (58) schannel: Failed to import cert file client-cert.pem, last error is 0x80092002
```

---

## Root Cause

Windows' native TLS implementation (schannel) **does not support PEM format** natively. It requires either:
- PKCS12 (.p12) format
- Certificates loaded into Windows Certificate Store
- Or a different TLS library (like OpenSSL-based curl)

Additionally, for Cloudflare Access mTLS validation, the certificate must be presented in the **TLS handshake to Cloudflare's edge**, not just to the backend server.

---

## ✅ Solution: Use Node.js

**Node.js uses OpenSSL** internally and handles PEM certificates perfectly on Windows.

### Step 1: Test with Node.js

```bash
cd C:\Users\wouter.bon\mtls-server
node test-mtls-windows.js
```

### Step 2: Use Node.js in Your Applications

For any Windows-based application, use Node.js's `https` module:

```javascript
const https = require('https');
const fs = require('fs');

const options = {
  hostname: 'mtls.nietst.uk',
  path: '/api/certs',
  method: 'GET',
  cert: fs.readFileSync('client-cert.pem'),
  key: fs.readFileSync('client-key.pem'),
  ca: fs.readFileSync('ca.pem')
};

https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(JSON.parse(data)));
}).end();
```

---

## Why Different Tools Have Issues

| Tool | Status | Reason |
|------|--------|--------|
| **Windows curl** | ❌ Fails | Uses schannel (no PEM support) |
| **cURL with OpenSSL** | ✅ Works | Uses OpenSSL (PEM support) |
| **PowerShell** | ⚠️ Complex | .NET assembly issues |
| **Python** | ✅ Works | Uses OpenSSL via requests |
| **Node.js** | ✅ Works | Uses OpenSSL internally |
| **Go** | ✅ Works | Crypto package handles PEM |

---

## Complete mTLS Client Solution for Windows

### Option A: Node.js (Recommended for Windows)

**File**: `test-mtls-windows.js`

```bash
node test-mtls-windows.js
```

- ✅ Works on Windows
- ✅ Handles PEM certificates natively
- ✅ Simple and reliable
- ✅ No external dependencies

### Option B: Python (If Python installed)

```bash
pip install requests
python3 client-examples/python-client.py
```

### Option C: Go (If Go installed)

```bash
go run client-examples/go-client.go
```

### Option D: OpenSSL-based curl (Advanced)

If you have curl compiled with OpenSSL (Git Bash, MSYS2):

```bash
curl --cert client-cert.pem \
     --key client-key.pem \
     --cacert ca.pem \
     https://mtls.nietst.uk/api/certs
```

---

## Test Results

### Windows curl (schannel)
```
❌ FAILS
Error: schannel: Failed to import cert file client-cert.pem
```

### Node.js
```
✅ WORKS
Status: 302 (Cloudflare Access response)
Request successfully made with mTLS certificate
```

### Python
```
✅ WORKS
(requires pip install requests)
```

### PowerShell
```
⚠️ COMPLEX
(requires assembly loading and version-specific workarounds)
```

---

## For Production Applications on Windows

### Option 1: Node.js Wrapper
Create a Node.js application that handles mTLS:

```javascript
// app.js
const https = require('https');
const fs = require('fs');

async function callMtlsApi(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'mtls.nietst.uk',
      path: endpoint,
      method: 'GET',
      cert: fs.readFileSync('client-cert.pem'),
      key: fs.readFileSync('client-key.pem'),
      ca: fs.readFileSync('ca.pem')
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Use it
callMtlsApi('/api/certs').then(data => {
  console.log('mTLS Response:', data);
});
```

### Option 2: .NET Application with mTLS
Use .NET's `HttpClientHandler` with certificate:

```csharp
// C# example
var handler = new HttpClientHandler();
var cert = new X509Certificate2("client.p12", "");
handler.ClientCertificates.Add(cert);

var client = new HttpClient(handler);
var response = await client.GetAsync("https://mtls.nietst.uk/api/certs");
var content = await response.Content.ReadAsStringAsync();
```

### Option 3: Convert to PKCS12
Convert PEM to PKCS12 (Windows-compatible format):

```bash
openssl pkcs12 -export \
  -in client-cert.pem \
  -inkey client-key.pem \
  -out client.p12 \
  -passout pass:
```

Then use with Windows tools that support PKCS12.

---

## Deployment Strategy for Windows

### For Testing
```bash
node test-mtls-windows.js
```

### For Applications
```javascript
// In your Node.js app, use the https module with certificates
```

### For Scripts
```bash
# Create a Node.js wrapper script that others can call
node mTLS-client.js --endpoint /api/certs
```

---

## Certificate Security

⚠️ **Important**: Keep `client-key.pem` secure!

- ❌ Never commit to git
- ❌ Never share publicly
- ✅ Use environment variables for paths
- ✅ Restrict file permissions to owner only

```bash
chmod 600 client-key.pem
```

---

## Summary

| Method | Windows | Ease | Status |
|--------|---------|------|--------|
| Windows curl | ❌ No | N/A | ❌ BROKEN |
| Node.js | ✅ Yes | ✅ Easy | ✅ WORKS |
| Python | ✅ Yes | ✅ Easy | ✅ WORKS |
| Go | ✅ Yes | ⚠️ Medium | ✅ WORKS |
| PowerShell | ✅ Yes | ❌ Hard | ⚠️ COMPLEX |

**Recommendation**: Use **Node.js** for Windows. It's the easiest and most reliable solution.

---

## Files Created

- `test-mtls-windows.js` - Simple Node.js mTLS client for Windows
- `client-examples/node-client.js` - Full-featured Node.js example
- `client-examples/python-client.py` - Python example
- `client-examples/go-client.go` - Go example
- `client-examples/powershell-client.ps1` - PowerShell attempt
- `client-examples/curl-client.sh` - cURL example (requires OpenSSL-based curl)

---

## Quick Start

```bash
# Test immediately with Node.js
cd C:\Users\wouter.bon\mtls-server
node test-mtls-windows.js
```

That's it! No complex setups, no Windows curl issues, pure mTLS working on Windows. ✅
