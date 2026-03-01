#!/usr/bin/env node
/**
 * Node.js mTLS Client Example
 * Tests the mTLS endpoint with client certificate authentication
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  host: 'mtls.nietst.uk',
  port: 443,
  path: '/api/certs',
  method: 'GET',
  // Client certificate authentication
  cert: fs.readFileSync(path.join(__dirname, '../client-cert.pem')),
  key: fs.readFileSync(path.join(__dirname, '../client-key.pem')),
  // CA certificate for verification (optional, set to false to skip)
  ca: fs.readFileSync(path.join(__dirname, '../ca.pem')),
  // For testing with self-signed certs
  rejectUnauthorized: false, // Set to true in production!
};

console.log(`\n🔐 mTLS Client - Connecting to ${config.host}:${config.port}${config.path}\n`);

const request = https.request(config, (response) => {
  console.log(`✅ Status: ${response.statusCode}`);
  console.log(`📋 Headers:`, response.headers);
  console.log('');

  let data = '';

  response.on('data', (chunk) => {
    data += chunk;
  });

  response.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('📄 Response:');
      console.log(JSON.stringify(json, null, 2));
      console.log('');

      if (json.mtls_valid) {
        console.log('✅ mTLS Authentication: SUCCESS');
      } else {
        console.log('❌ mTLS Authentication: FAILED');
      }
    } catch (e) {
      console.log('📄 Response:', data);
    }
  });
});

request.on('error', (error) => {
  console.error('❌ Error:', error.message);
  console.error('\nTroubleshooting:');
  console.error('1. Verify client-cert.pem and client-key.pem exist');
  console.error('2. Check that mtls.nietst.uk DNS resolves');
  console.error('3. Ensure Cloudflare Tunnel is running');
  console.error('4. Verify mTLS policy is active in Cloudflare Access');
  process.exit(1);
});

request.end();
