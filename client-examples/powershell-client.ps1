# PowerShell mTLS Client - Simple Version
# Uses Invoke-WebRequest with client certificate
#

param(
    [string]$HostName = "mtls.nietst.uk",
    [string]$Path = "/api/certs",
    [string]$CertDir = "C:\Users\wouter.bon\mtls-server"
)

# Configuration
$baseUrl = "https://$HostName$Path"
$p12File = Join-Path $CertDir "client.p12"

Write-Host "`n[*] mTLS Client (PowerShell) - Testing $HostName$Path`n" -ForegroundColor Green

# Verify certificate exists
Write-Host "[*] Checking certificate..." -ForegroundColor Yellow
if (-not (Test-Path $p12File)) {
    Write-Host "[ERROR] Certificate not found: $p12File" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Certificate found`n" -ForegroundColor Green

# Load certificate into store (temporary)
Write-Host "[*] Loading certificate..." -ForegroundColor Yellow
try {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
    $cert.Import($p12File, "", "DefaultKeySet")
    Write-Host "[OK] Certificate loaded" -ForegroundColor Green
    Write-Host "    Subject: $($cert.Subject)" -ForegroundColor Gray
    Write-Host "    Thumbprint: $($cert.Thumbprint)`n" -ForegroundColor Gray
} catch {
    Write-Host "[ERROR] Failed to load certificate: $_" -ForegroundColor Red
    exit 1
}

# Make request with certificate
Write-Host "[*] Making mTLS request to: $baseUrl`n" -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest `
        -Uri $baseUrl `
        -Certificate $cert `
        -ErrorAction Stop

    Write-Host "[OK] Request successful`n" -ForegroundColor Green
    Write-Host "[*] Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "[*] Content Length: $($response.Content.Length) bytes`n" -ForegroundColor Gray

    # Parse response
    try {
        $json = $response.Content | ConvertFrom-Json
        Write-Host "[*] Response:" -ForegroundColor Cyan
        Write-Host ($json | ConvertTo-Json -Depth 5) -ForegroundColor Green
        Write-Host ""

        if ($json.mtls_valid) {
            Write-Host "[SUCCESS] mTLS Authentication: VERIFIED" -ForegroundColor Green
        } else {
            Write-Host "[INFO] mTLS Authentication: Not validated" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[*] Response (raw):" -ForegroundColor Cyan
        Write-Host $response.Content -ForegroundColor Green
    }

} catch {
    Write-Host "[ERROR] Request failed: $_`n" -ForegroundColor Red
    Write-Host "[*] Troubleshooting:" -ForegroundColor Yellow
    Write-Host "    1. Verify certificate exists: $p12File" -ForegroundColor White
    Write-Host "    2. Check DNS: nslookup $HostName" -ForegroundColor White
    Write-Host "    3. Verify Cloudflare Tunnel is running" -ForegroundColor White
    Write-Host "    4. Check network connectivity to Cloudflare" -ForegroundColor White
    exit 1
}

Write-Host ""
