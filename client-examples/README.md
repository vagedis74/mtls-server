# mTLS Client Examples

Complete examples showing how to authenticate with the mTLS server using client certificates.

## Overview

The mTLS server is deployed at `https://mtls.nietst.uk` and requires client certificate authentication.

**Endpoint**: `https://mtls.nietst.uk/api/certs`

**Authentication**: Mutual TLS (mTLS) with client certificate

**Required Certificates**:
- `client-cert.pem` - Client certificate
- `client-key.pem` - Client private key
- `ca.pem` - CA certificate for verification

---

## Examples

### 1. cURL (Command Line)

**Prerequisites**: `curl` compiled with OpenSSL (not Windows schannel)

```bash
cd client-examples
chmod +x curl-client.sh
./curl-client.sh
```

**Manual cURL command**:
```bash
curl -v \
  --cert client-cert.pem \
  --key client-key.pem \
  --cacert ca.pem \
  https://mtls.nietst.uk/api/certs
```

**Expected Response** (200 OK):
```json
{
  "mtls_valid": true,
  "presented_certificates": [...],
  "verified_chains": [...],
  "message": "mTLS certificate validation successful!",
  "timestamp": "2026-03-01T..."
}
```

---

### 2. Node.js

**Prerequisites**: Node.js 14+

```bash
cd client-examples
node node-client.js
```

**Code**:
```javascript
const https = require('https');
const fs = require('fs');

const options = {
  host: 'mtls.nietst.uk',
  path: '/api/certs',
  method: 'GET',
  cert: fs.readFileSync('client-cert.pem'),
  key: fs.readFileSync('client-key.pem'),
  ca: fs.readFileSync('ca.pem'),
  rejectUnauthorized: false // Set to true in production!
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(JSON.parse(data)));
});

req.on('error', err => console.error(err));
req.end();
```

---

### 3. Python

**Prerequisites**: Python 3.6+, `requests` library

```bash
pip install requests
cd client-examples
python3 python-client.py
```

**Code**:
```python
import requests

response = requests.get(
    'https://mtls.nietst.uk/api/certs',
    cert=('client-cert.pem', 'client-key.pem'),
    verify='ca.pem',
    timeout=10
)

print(response.json())
```

---

### 4. Go

**Prerequisites**: Go 1.16+

```bash
cd client-examples
go run go-client.go
```

**Code**:
```go
package main

import (
	"crypto/tls"
	"crypto/x509"
	"net/http"
	"os"
)

func main() {
	// Load client certificate
	cert, _ := tls.LoadX509KeyPair(
		"client-cert.pem",
		"client-key.pem",
	)

	// Load CA certificate
	caCert, _ := os.ReadFile("ca.pem")
	caCertPool := x509.NewCertPool()
	caCertPool.AppendCertsFromPEM(caCert)

	// Create TLS config
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      caCertPool,
	}

	// Make request
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: tlsConfig,
		},
	}

	resp, _ := client.Get("https://mtls.nietst.uk/api/certs")
	// ... handle response
}
```

---

## Testing Locally

To test against your local server (bypasses Cloudflare):

```bash
curl -k --cert client-cert.pem --key client-key.pem https://127.0.0.1:9443/api/certs
```

---

## Troubleshooting

### "Certificate not found"
- Verify certificate files exist in the parent directory
- Check file paths are correct
- Run from the client-examples directory

### "SSL/TLS Error"
- Ensure certificates are in PEM format
- Check certificate validity:
  ```bash
  openssl x509 -in client-cert.pem -text -noout
  ```
- Verify CA certificate is correct:
  ```bash
  openssl verify -CAfile ca.pem client-cert.pem
  ```

### "Connection refused"
- Verify Cloudflare Tunnel is running:
  ```bash
  cloudflared tunnel status
  ```
- Check DNS resolution:
  ```bash
  nslookup mtls.nietst.uk
  ```
- Ensure network allows outbound to Cloudflare

### "401 Unauthorized" or "403 Forbidden"
- Verify client certificate is valid
- Check Cloudflare Access mTLS policy is active
- Ensure certificate is properly signed by CA

---

## Production Considerations

1. **Always verify certificates**:
   - Set `rejectUnauthorized: true` (Node.js)
   - Use `verify=ca.pem` (Python)
   - Don't use `InsecureSkipVerify: true` (Go)

2. **Certificate rotation**:
   - Implement automatic certificate renewal
   - Test before expiration

3. **Security**:
   - Don't commit private keys to version control
   - Use environment variables for cert paths
   - Implement certificate pinning for critical applications

4. **Monitoring**:
   - Log all mTLS authentication attempts
   - Alert on certificate expiration
   - Monitor connection errors

---

## Integration Examples

### Express.js (with proxy)
```javascript
const https = require('https');
const express = require('express');
const fs = require('fs');

const agent = new https.Agent({
  cert: fs.readFileSync('client-cert.pem'),
  key: fs.readFileSync('client-key.pem'),
  ca: fs.readFileSync('ca.pem')
});

app.get('/status', async (req, res) => {
  const response = await fetch('https://mtls.nietst.uk/api/certs', {
    agent
  });
  res.json(await response.json());
});
```

### FastAPI (Python)
```python
import httpx
from fastapi import FastAPI

app = FastAPI()

client = httpx.AsyncClient(
    cert=('client-cert.pem', 'client-key.pem'),
    verify='ca.pem'
)

@app.get("/status")
async def get_status():
    response = await client.get('https://mtls.nietst.uk/api/certs')
    return response.json()
```

---

## Support

For issues or questions:
1. Verify certificates are valid
2. Test with cURL first
3. Check Cloudflare Access policy is active
4. Review Cloudflare Tunnel logs
