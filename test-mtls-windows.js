#!/usr/bin/env node

/**
 * Windows-Friendly mTLS Client
 * Solves the Windows curl (schannel) PEM certificate issue
 * Run: node test-mtls-windows.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const HOST = 'mtls.nietst.uk';
const PORT = 443;
const ENDPOINT = '/api/certs';
const CERT_DIR = __dirname;

console.log('\n🔐 mTLS Test - Windows Compatible\n');
console.log(`📡 Target: https://${HOST}${ENDPOINT}\n`);

// Verify certificates exist
const certPath = path.join(CERT_DIR, 'client-cert.pem');
const keyPath = path.join(CERT_DIR, 'client-key.pem');
const caPath = path.join(CERT_DIR, 'ca.pem');

console.log('📋 Checking certificates...');
try {
  if (!fs.existsSync(certPath)) throw new Error(`Not found: ${certPath}`);
  if (!fs.existsSync(keyPath)) throw new Error(`Not found: ${keyPath}`);
  if (!fs.existsSync(caPath)) throw new Error(`Not found: ${caPath}`);
  console.log('✅ All certificates found\n');
} catch (err) {
  console.error('❌ Certificate error:', err.message);
  process.exit(1);
}

// Load certificates
const options = {
  hostname: HOST,
  port: PORT,
  path: ENDPOINT,
  method: 'GET',
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath),
  ca: fs.readFileSync(caPath),
  // For testing with self-signed certs
  rejectUnauthorized: false
};

console.log('🚀 Making request...\n');

const req = https.request(options, (res) => {
  console.log(`✅ Status: ${res.statusCode}\n`);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('📄 Response:');
      console.log(JSON.stringify(json, null, 2));
      console.log('');

      if (json.mtls_valid) {
        console.log('✅ SUCCESS: mTLS Authentication verified!');
      } else {
        console.log('⚠️  INFO: No client certificate was validated');
      }
      console.log('');
    } catch (e) {
      console.log('Response (raw):', data);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Error:', err.message);
  console.error('\nTroubleshooting:');
  console.error('1. Verify certificates exist');
  console.error('2. Check network connectivity');
  console.error('3. Verify Cloudflare Tunnel is running');
  process.exit(1);
});

req.end();
