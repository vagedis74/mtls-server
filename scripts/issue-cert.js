#!/usr/bin/env node

/**
 * issue-cert.js - Issue or renew Let's Encrypt certificate via DNS-01 challenge
 *
 * Simplified version using acme-client with proper API calls
 */

const acme = require('acme-client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = '9b9e2119bd8cf84887e5eaa68fcbe58e';
const DOMAIN = 'mtls.nietst.uk';
const LE_DIRECTORY = path.join(__dirname, '..', 'letsencrypt');
const CERT_DIR = path.join(__dirname, '..');
const USE_PRODUCTION = process.argv.includes('--production');

const LE_DIRECTORY_URL = USE_PRODUCTION
  ? 'https://acme-v02.api.letsencrypt.org/directory'
  : 'https://acme-staging-v02.api.letsencrypt.org/directory';

const ACCOUNT_KEY_PATH = path.join(LE_DIRECTORY, 'account.json');
const PRIVATE_KEY_PATH = path.join(LE_DIRECTORY, 'key.pem');

/**
 * Make HTTPS request
 */
function httpsRequest(method, hostname, path, body = null, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port: 443,
      path,
      method,
      headers: customHeaders,
    };

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(bodyStr);
    }

    req.end();
  });
}

/**
 * Cloudflare API headers
 */
function getCFHeaders() {
  return {
    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Delete all existing TXT records for a name
 */
async function deleteExistingRecords(recordName) {
  console.log(`[DNS] Cleaning up old records for: ${recordName}`);

  const response = await httpsRequest(
    'GET',
    'api.cloudflare.com',
    `/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=${encodeURIComponent(recordName)}&type=TXT`,
    null,
    getCFHeaders()
  );

  const result = response.data;

  if (!result.success) {
    console.warn(`[DNS] Warning: Could not list existing records: ${result.errors}`);
    return;
  }

  const records = result.result || [];
  for (const record of records) {
    console.log(`[DNS] Deleting old record: ${record.id}`);
    await deleteDNSRecord(record.id);
  }

  if (records.length > 0) {
    console.log(`[DNS] Cleaned up ${records.length} old record(s)`);
  }
}

/**
 * Create DNS TXT record
 */
async function createDNSRecord(recordName, recordValue) {
  console.log(`[DNS] Creating record: ${recordName}`);

  const body = {
    type: 'TXT',
    name: recordName,
    content: recordValue,
    ttl: 120,
  };

  const response = await httpsRequest(
    'POST',
    'api.cloudflare.com',
    `/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
    body,
    getCFHeaders()
  );

  const result = response.data;

  if (!result.success) {
    const errors = result.errors || [];
    const errorMsg = errors.map(e => `${e.message} (${e.code})`).join(', ');

    if (errors.some(e => e.code === 10000)) {
      throw new Error(`Authentication error: Your CLOUDFLARE_API_TOKEN doesn't have DNS:Edit permission.\n\nFix:\n1. Go to Cloudflare Dashboard → API Tokens\n2. Create new token with scopes: Zone → DNS:Edit\n3. Copy token to .env as CLOUDFLARE_API_TOKEN\n\nError details: ${errorMsg}`);
    }

    throw new Error(`Failed to create DNS record: ${errorMsg}`);
  }

  return result.result.id;
}

/**
 * Delete DNS TXT record
 */
async function deleteDNSRecord(recordId) {
  console.log(`[DNS] Deleting record: ${recordId}`);

  const response = await httpsRequest(
    'DELETE',
    'api.cloudflare.com',
    `/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${recordId}`,
    null,
    getCFHeaders()
  );

  const result = response.data;

  if (!result.success) {
    console.warn(`[DNS] Warning: Failed to delete DNS record ${recordId}`);
  }
}

/**
 * Wait for DNS propagation
 */
async function waitForDNSPropagation(recordName, expectedValue, maxWait = 120000) {
  console.log(`[DNS] Waiting for propagation of ${recordName}...`);

  const dns = require('dns').promises;
  const startTime = Date.now();
  let lastError = null;

  while (Date.now() - startTime < maxWait) {
    try {
      const records = await dns.resolveTxt(recordName);
      const found = records.some(record =>
        record.join('') === expectedValue
      );

      if (found) {
        console.log(`[DNS] ✓ Record verified!`);
        // Wait additional time to ensure global propagation
        console.log(`[DNS] Waiting 10s for global propagation...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        return true;
      }
    } catch (e) {
      lastError = e;
      // DNS lookup failed, continue polling
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`[DNS] Waiting... (${elapsed}s elapsed)`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.error(`[DNS] Timeout waiting for propagation after ${maxWait / 1000}s`);
  if (lastError) {
    console.error(`[DNS] Last error: ${lastError.message}`);
  }
  throw new Error(`DNS propagation timeout for ${recordName}`);
}

/**
 * Load or create ACME account
 */
async function loadOrCreateAccount() {
  console.log('[ACME] Loading or creating account...');

  let accountKey;

  if (fs.existsSync(ACCOUNT_KEY_PATH)) {
    const data = JSON.parse(fs.readFileSync(ACCOUNT_KEY_PATH, 'utf-8'));
    accountKey = data;
    console.log('[ACME] Using existing account key');
  } else {
    // Create new account key
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    accountKey = {
      pem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    };

    fs.mkdirSync(LE_DIRECTORY, { recursive: true });
    fs.writeFileSync(ACCOUNT_KEY_PATH, JSON.stringify(accountKey));
    console.log('[ACME] Created new account key');
  }

  return accountKey.pem;
}

/**
 * Main certificate issuance
 */
async function issueCertificate() {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Let's Encrypt Certificate Issuance`);
    console.log(`Domain: ${DOMAIN}`);
    console.log(`Environment: ${USE_PRODUCTION ? 'PRODUCTION' : 'STAGING'}`);
    console.log(`${'='.repeat(60)}\n`);

    // Create directory
    fs.mkdirSync(LE_DIRECTORY, { recursive: true });

    // Load account key
    const accountKeyPem = await loadOrCreateAccount();

    // Initialize ACME client with increased backoff for DNS verification
    const client = new acme.Client({
      directoryUrl: LE_DIRECTORY_URL,
      accountKey: accountKeyPem,
      backoffAttempts: 30,    // Increase from default 10 for longer retry window
      backoffMin: 5000,       // 5 seconds minimum
      backoffMax: 30000,      // 30 seconds maximum
    });

    // Register account
    console.log('[ACME] Registering account...');
    const account = await client.createAccount({
      termsOfServiceAgreed: true,
      contact: ['mailto:admin@mtls.nietst.uk'],
    });
    console.log('[ACME] Account registered');

    // Generate CSR
    console.log('[CSR] Generating CSR...');
    const [serverKey, csr] = await acme.crypto.createCsr({
      keySize: 2048,
      commonName: DOMAIN,
      altNames: [DOMAIN],
    });

    // Save server private key
    fs.writeFileSync(PRIVATE_KEY_PATH, serverKey);

    // Create order
    console.log('[ACME] Creating order...');
    const order = await client.createOrder({
      identifiers: [
        { type: 'dns', value: DOMAIN },
      ],
    });
    console.log('[ACME] Order created');

    // Get authorizations
    const authorizations = await client.getAuthorizations(order);
    console.log(`[ACME] Got ${authorizations.length} authorization(s)`);

    // Track DNS records for cleanup
    const dnsRecordIds = [];

    // Process each authorization
    const challenges = [];
    for (const auth of authorizations) {
      // Find DNS-01 challenge
      const challenge = auth.challenges.find(c => c.type === 'dns-01');
      if (!challenge) {
        throw new Error('No dns-01 challenge found');
      }

      // Get key authorization
      // For dns-01, getChallengeKeyAuthorization() already returns
      // base64url(sha256(token.thumbprint)) — the final DNS record value
      const dnsValue = await client.getChallengeKeyAuthorization(challenge);
      const dnsName = `_acme-challenge.${auth.identifier.value}`;

      console.log('[ACME] DNS record name:', dnsName);
      console.log('[ACME] DNS record value:', dnsValue);

      // Delete old records first (from previous attempts)
      await deleteExistingRecords(dnsName);

      // Create DNS record
      const recordId = await createDNSRecord(dnsName, dnsValue);
      dnsRecordIds.push(recordId);

      // Wait for DNS propagation (safety check)
      await waitForDNSPropagation(dnsName, dnsValue);

      // Wait extra time for Cloudflare DNS to propagate globally
      console.log('[DNS] Waiting 30s for global DNS propagation...');
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Notify ACME CA the challenge is ready (no local DNS check)
      console.log('[ACME] Notifying challenge ready...');
      await client.completeChallenge(challenge);

      challenges.push({ auth, challenge });
    }

    // Wait for all authorizations to be verified by ACME CA
    console.log('[ACME] Waiting for ACME CA to verify challenges...');
    for (const { auth } of challenges) {
      console.log(`[ACME] Waiting for authorization: ${auth.identifier.value}...`);
      try {
        await client.waitForValidStatus(auth);
        console.log(`[ACME] ✓ Authorization verified: ${auth.identifier.value}`);
      } catch (e) {
        throw new Error(`Challenge verification failed for ${auth.identifier.value}: ${e.message}`);
      }
    }

    // Finalize order (send CSR)
    console.log('[ACME] Finalizing order...');
    const finalized = await client.finalizeOrder(order, csr);

    // Get certificate
    console.log('[ACME] Retrieving certificate...');
    const certificate = await client.getCertificate(finalized);

    // Save certificate
    const fullChainPath = path.join(LE_DIRECTORY, 'fullchain.pem');
    fs.writeFileSync(fullChainPath, certificate);
    console.log('[CERT] Certificate saved');

    // Copy to project root
    console.log('[CERT] Copying to project root...');
    fs.copyFileSync(fullChainPath, path.join(CERT_DIR, 'cert.pem'));
    fs.copyFileSync(PRIVATE_KEY_PATH, path.join(CERT_DIR, 'key.pem'));
    console.log('[CERT] Files copied: cert.pem, key.pem');

    // Clean up DNS records
    console.log('[DNS] Cleaning up DNS records...');
    for (const recordId of dnsRecordIds) {
      await deleteDNSRecord(recordId);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✓ Certificate issued successfully!');
    console.log('='.repeat(60) + '\n');

    // Display certificate info
    try {
      const { execSync } = require('child_process');
      const info = execSync(`openssl x509 -in cert.pem -noout -dates -subject -issuer`).toString();
      console.log(info);
    } catch (e) {
      console.warn('Could not display certificate info');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run
issueCertificate();
