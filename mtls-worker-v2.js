addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // API endpoint
    if (path === '/api/certs') {
      return new Response(JSON.stringify({
        mtls_valid: true,
        message: 'mTLS certificate accepted',
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Default
    return new Response(JSON.stringify({
      message: 'mTLS Worker',
      paths: ['/health', '/api/certs'],
      status: 'operational'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      worker: 'mtls-worker-v2'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
