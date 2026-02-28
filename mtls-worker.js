/**
 * Cloudflare Worker for mTLS Testing
 * Handles requests to nietst.uk and returns mTLS status
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Health check endpoint
  if (path === '/health') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // mTLS status endpoint
  if (path === '/api/certs' || path === '/') {
    // If request reached here, Access policy validated the mTLS certificate
    const certInfo = {
      mtls_valid: true,
      presented_certificates: [],
      verified_chains: [],
      message: 'mTLS certificate validation successful!',
      timestamp: new Date().toISOString(),
      worker: 'mtls-worker',
      region: request.headers.get('cf-ray')
    };

    return new Response(JSON.stringify(certInfo, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }

  // Default response
  return new Response(JSON.stringify({
    message: 'mTLS Worker Active',
    endpoints: {
      '/api/certs': 'Check mTLS status',
      '/health': 'Health check'
    }
  }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
