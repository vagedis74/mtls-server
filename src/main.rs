mod response;
mod server;

use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use response::MtlsResponse;
use server::{build_tls_config, on_connect_handler, parse_certificates, PeerCertificates};
use std::env;

/// Handler for /health endpoint (no authentication required)
async fn health_handler() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok"
    }))
}

/// Handler for /api/certs endpoint
async fn certs_handler(req: HttpRequest) -> HttpResponse {
    // Try to extract peer certificates from connection data
    let response = if let Some(peer_certs) = req.conn_data::<PeerCertificates>() {
        let certificates = parse_certificates(&peer_certs.0);
        MtlsResponse {
            mtls_valid: !certificates.is_empty(),
            presented_certificates: certificates.clone(),
            verified_chains: if !certificates.is_empty() {
                vec![certificates]
            } else {
                Vec::new()
            },
        }
    } else {
        MtlsResponse::new(false)
    };

    HttpResponse::Ok().json(response)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Get configuration from environment or use defaults
    let addr = env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("BIND_PORT").unwrap_or_else(|_| "9443".to_string());
    let server_addr = format!("{}:{}", addr, port);

    let cert_path = env::var("CERT_PATH").unwrap_or_else(|_| "cert.pem".to_string());
    let key_path = env::var("KEY_PATH").unwrap_or_else(|_| "key.pem".to_string());
    let ca_path = env::var("CA_PATH").unwrap_or_else(|_| "ca.pem".to_string());

    println!("Building TLS config from cert={}, key={}, ca={}",
             cert_path, key_path, ca_path);

    // Build TLS configuration
    let tls_config = build_tls_config(&cert_path, &key_path, &ca_path)
        .expect("Failed to build TLS config");

    println!("Starting mTLS server on {}", server_addr);

    // Create and run HTTP server
    // NOTE: .on_connect() must be called BEFORE .bind_rustls_0_23() because
    // bind captures on_connect_fn by value at call time.
    HttpServer::new(|| {
        App::new()
            .route("/health", web::get().to(health_handler))
            .route("/api/certs", web::get().to(certs_handler))
    })
    .on_connect(on_connect_handler)
    .bind_rustls_0_23(&server_addr, tls_config)?
    .run()
    .await
}
