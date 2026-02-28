use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CertificateInfo {
    pub subject_cn: Option<String>,
    pub issuer_cn: Option<String>,
    pub not_before: String,
    pub not_after: String,
    pub is_ca: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MtlsResponse {
    pub mtls_valid: bool,
    pub presented_certificates: Vec<CertificateInfo>,
    pub verified_chains: Vec<Vec<CertificateInfo>>,
}

impl MtlsResponse {
    pub fn new(mtls_valid: bool) -> Self {
        Self {
            mtls_valid,
            presented_certificates: Vec::new(),
            verified_chains: Vec::new(),
        }
    }
}
