#!/usr/bin/env node

/**
 * renew-cert.js - Check certificate expiry and renew if needed
 *
 * Checks if cert.pem expires within 30 days.
 * If yes, runs issue-cert.js and restarts the server.
 *
 * Usage: node scripts/renew-cert.js [--force]
 *
 * --force: Renew regardless of expiry date
 */

const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const CERT_PATH = path.join(__dirname, '..', 'cert.pem');
const PROJECT_DIR = path.join(__dirname, '..');
const DAYS_BEFORE_EXPIRY = 30;
const FORCE = process.argv.includes('--force');

const CLOUDFLARED_EXE = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const CLOUDFLARED_CONFIG = path.join(PROJECT_DIR, 'cloudflared-config.yml');
const MTLS_SERVER_EXE = path.join(PROJECT_DIR, 'target', 'debug', 'mtls-server.exe');
const LOG_DIR = 'C:\\Users\\wouter.bon\\AppData\\Local\\Temp\\mtls-logs';

/**
 * Parse certificate expiry date using Node.js crypto (no openssl binary needed)
 */
function getCertExpiryDate(certPath) {
  try {
    const { X509Certificate } = require('crypto');
    const pem = fs.readFileSync(certPath, 'utf-8');
    // X509Certificate takes the first cert in the chain
    const cert = new X509Certificate(pem);
    return new Date(cert.validTo);
  } catch (error) {
    throw new Error(`Failed to read certificate: ${error.message}`);
  }
}

/**
 * Check if certificate needs renewal
 */
async function needsRenewal() {
  if (FORCE) {
    console.log('[CERT] Forced renewal requested');
    return true;
  }

  if (!fs.existsSync(CERT_PATH)) {
    console.log('[CERT] Certificate not found - issuance required');
    return true;
  }

  const expiryDate = getCertExpiryDate(CERT_PATH);
  const daysUntilExpiry = Math.floor((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

  console.log(`[CERT] Certificate expires in ${daysUntilExpiry} days (${expiryDate.toISOString()})`);

  if (daysUntilExpiry <= DAYS_BEFORE_EXPIRY) {
    console.log(`[CERT] ⚠️  Renewal needed (expires within ${DAYS_BEFORE_EXPIRY} days)`);
    return true;
  }

  console.log(`[CERT] ✓ Certificate valid (expires in ${daysUntilExpiry} days)`);
  return false;
}

/**
 * Kill process by name (Windows)
 */
async function killProcess(processName) {
  try {
    await execAsync(`taskkill /F /IM ${processName}`);
    console.log(`[PROC] Killed ${processName}`);
  } catch (error) {
    // Process may not be running
    if (!error.message.includes('not found')) {
      console.warn(`[PROC] Warning: ${error.message}`);
    }
  }
}

/**
 * Kill process by name (Unix/Linux)
 */
async function killProcessUnix(processName) {
  try {
    await execAsync(`pkill -f "${processName}"`);
    console.log(`[PROC] Killed ${processName}`);
  } catch (error) {
    // Process may not be running
  }
}

/**
 * Check if running on Windows
 */
function isWindows() {
  return process.platform === 'win32';
}

/**
 * Main renewal flow
 */
async function renewCertificate() {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Let's Encrypt Certificate Renewal Check`);
    console.log(`${'='.repeat(60)}\n`);

    const shouldRenew = await needsRenewal();

    if (!shouldRenew) {
      console.log('\n✓ No renewal needed');
      return;
    }

    console.log('\n[RENEWAL] Starting production certificate issuance...');
    const issueScript = path.join(__dirname, 'issue-cert.js');

    // Run issue-cert.js with --production flag
    const result = await execFileAsync('node', [issueScript, '--production'], {
      cwd: PROJECT_DIR,
      timeout: 300000,
    });
    console.log(result.stdout);
    if (result.stderr) console.warn(result.stderr);

    // Ensure log directory exists
    fs.mkdirSync(LOG_DIR, { recursive: true });

    // Restart mtls-server
    console.log('\n[SERVER] Restarting mTLS server...');
    await killProcess('mtls-server.exe');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const serverLog = path.join(LOG_DIR, 'mtls-server.log');
    exec(`"${MTLS_SERVER_EXE}" >> "${serverLog}" 2>&1`, { detached: true, cwd: PROJECT_DIR, env: { ...process.env, BIND_PORT: '9445' } });
    console.log(`[SERVER] ✓ Started (log: ${serverLog})`);

    // Restart cloudflared
    console.log('\n[TUNNEL] Restarting cloudflared...');
    await killProcess('cloudflared.exe');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const tunnelLog = path.join(LOG_DIR, 'cloudflared.log');
    exec(`"${CLOUDFLARED_EXE}" tunnel --config "${CLOUDFLARED_CONFIG}" run >> "${tunnelLog}" 2>&1`, { detached: true });
    console.log(`[TUNNEL] ✓ Started (log: ${tunnelLog})`);

    console.log('\n' + '='.repeat(60));
    console.log('✓ Certificate renewed and services restarted!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stderr) {
      console.error('[STDERR]', error.stderr);
    }
    process.exit(1);
  }
}

// Run
renewCertificate();
