use actix_web::dev::Extensions;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::{RootCertStore, ServerConfig};
use rustls_pemfile::{certs, pkcs8_private_keys};
use std::any::Any;
use std::fs;
use std::io::BufReader;
use std::sync::Arc;
use x509_parser::prelude::{FromDer, X509Certificate};

use crate::response::CertificateInfo;

/// Newtype wrapper for peer certificates in DER format
#[derive(Clone, Debug)]
pub struct PeerCertificates(pub Vec<Vec<u8>>);

/// Server struct for testing/configuration
#[derive(Clone)]
pub struct MtlsServer {
    pub addr: String,
}

impl MtlsServer {
    pub fn new(addr: String) -> Self {
        Self { addr }
    }
}

/// Build TLS configuration with optional client certificate verification
pub fn build_tls_config(
    cert_path: &str,
    key_path: &str,
    ca_path: &str,
) -> Result<ServerConfig, Box<dyn std::error::Error>> {
    // Load CA certificate into root cert store for client verification
    let ca_pem = fs::read(ca_path)?;
    let mut root_store = RootCertStore::empty();

    let mut ca_reader = BufReader::new(&ca_pem[..]);
    for cert in certs(&mut ca_reader) {
        let cert_der = CertificateDer::from(cert?);
        root_store.add(cert_der)?;
    }

    // Load server certificate chain
    let cert_pem = fs::read(cert_path)?;
    let mut cert_reader = BufReader::new(&cert_pem[..]);
    let cert_chain: Vec<CertificateDer> = certs(&mut cert_reader)
        .map(|cert| CertificateDer::from(cert.expect("cert parsing failed")))
        .collect();

    if cert_chain.is_empty() {
        return Err("No certificates found".into());
    }

    // Load server private key
    let key_pem = fs::read(key_path)?;
    let mut key_reader = BufReader::new(&key_pem[..]);
    let mut keys = pkcs8_private_keys(&mut key_reader);
    let key_der = PrivateKeyDer::from(keys.next()
        .ok_or("No private key found")??);

    // Build server config using builder pattern
    // Create client cert verifier with optional client auth
    // WebPkiClientVerifier with allow_unauthenticated() accepts both authenticated and unauthenticated connections
    let client_verifier = rustls::server::WebPkiClientVerifier::builder(Arc::new(root_store))
        .allow_unauthenticated()
        .build()?;

    let config = ServerConfig::builder()
        .with_client_cert_verifier(client_verifier)
        .with_single_cert(cert_chain, key_der)?;

    Ok(config)
}

/// Handle TLS connection and extract peer certificates
pub fn on_connect_handler(connection: &dyn Any, data: &mut Extensions) {
    println!("[on_connect_handler] Called");

    // Try to downcast to TlsStream and extract peer certificates
    // For rustls 0.23 with actix-tls
    if let Some(tls_stream) = connection.downcast_ref::<actix_tls::accept::rustls_0_23::TlsStream<tokio::net::TcpStream>>() {
        println!("[on_connect_handler] Successfully downcast to TlsStream");
        let (_, server_connection) = tls_stream.get_ref();

        if let Some(peer_certs) = server_connection.peer_certificates() {
            println!("[on_connect_handler] Found {} peer certificates", peer_certs.len());
            let der_certs: Vec<Vec<u8>> = peer_certs
                .iter()
                .map(|cert_der| cert_der.as_ref().to_vec())
                .collect();

            if !der_certs.is_empty() {
                println!("[on_connect_handler] Storing {} DER certificates", der_certs.len());
                data.insert(PeerCertificates(der_certs));
            }
        } else {
            println!("[on_connect_handler] No peer certificates found");
        }
    } else {
        println!("[on_connect_handler] Failed to downcast to TlsStream");
    }
}

/// Parse DER-encoded certificates into CertificateInfo
pub fn parse_certificates(der_chain: &[Vec<u8>]) -> Vec<CertificateInfo> {
    der_chain
        .iter()
        .filter_map(|der_bytes| {
            let (_, cert) = X509Certificate::from_der(der_bytes).ok()?;

            // Extract subject CN
            let subject_cn = cert
                .subject()
                .iter_common_name()
                .next()
                .and_then(|cn| cn.as_str().ok().map(|s| s.to_string()));

            // Extract issuer CN
            let issuer_cn = cert
                .issuer()
                .iter_common_name()
                .next()
                .and_then(|cn| cn.as_str().ok().map(|s| s.to_string()));

            // Extract validity dates
            let not_before = cert.validity().not_before;
            let not_after = cert.validity().not_after;

            let not_before_str = not_before.to_string();
            let not_after_str = not_after.to_string();

            // Check if CA - look for Basic Constraints extension
            let is_ca = cert
                .tbs_certificate
                .extensions()
                .iter()
                .find(|ext| {
                    // OID 2.5.29.19 is Basic Constraints
                    ext.oid.to_string() == "2.5.29.19"
                })
                .and_then(|ext| {
                    x509_parser::extensions::BasicConstraints::from_der(ext.value)
                        .ok()
                        .map(|(_, bc)| bc.ca)
                })
                .unwrap_or(false);

            Some(CertificateInfo {
                subject_cn,
                issuer_cn,
                not_before: not_before_str,
                not_after: not_after_str,
                is_ca,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mtls_server_creation() {
        let server = MtlsServer::new("127.0.0.1:9443".to_string());
        assert_eq!(server.addr, "127.0.0.1:9443");
    }
}
