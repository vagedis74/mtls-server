# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

mTLS Server is a Go-based example HTTPS server that:
- Generates valid Let's Encrypt certificates automatically via ACME
- Validates connections using Mutual TLS (mTLS) authentication
- Runs two parallel servers: HTTP (for ACME challenges) and HTTPS (for mTLS)
- Provides both HTML and JSON endpoints showing certificate verification status

## Common Commands

### Building & Running
- **Build binary**: `make build` - Produces `mtls-server` in `cmd/mtls-server/`
- **Run tests**: `make test` - Runs tests in the `server` package only
- **Run single test**: `go test -run TestName ./server`
- **Build Docker image**: `make docker` - Creates `mtls-server` image
- **Lint**: `make lint` - Runs golangci-lint v1.56 via Docker

### Dependency Management
- **Update vendor**: `make vendor` - Runs `go mod tidy` then `go mod vendor`
- **Upgrade dependencies**: `make upgrade-vendor` - Updates all dependencies to latest versions
- **Format code**: `make deploy` - Runs `go fmt ./`

## Architecture

### Entry Point: `cmd/mtls-server/main.go`
Handles CLI flags and environment setup:
- **Flags**: `-staging` (use Let's Encrypt staging), `-index-template`, `-root-ca`, `-client-cert`
- **Environment**: Requires `DEMO_FQDN` environment variable (e.g., `example.com`)
- Loads client CA certificate from PEM file and passes to server

### Core Server: `server/server.go`
**MTLSServer** manages two HTTP servers:
- **HTTP (port 80)**: Runs ACME HTTP-01 challenges via `certManager.HTTPHandler()`
- **HTTPS (port 443)**: Serves actual application with mTLS verification

**Key Configuration**:
- Uses `autocert.Manager` for automatic certificate lifecycle
- `ClientAuth = tls.VerifyClientCertIfGiven` - Optional mTLS (allows both authenticated and unauthenticated requests)
- Accepts TOS automatically for Let's Encrypt
- Supports staging ACME server via `config.UseStaging` flag

**Endpoints**:
- `/` - HTML response showing certificate verification status
- `/json` - JSON response with 401 if mTLS invalid
- `/images/mtls-on.svg`, `/images/mtls-off.svg` - SVG assets
- `/<client-cert-name>` - Downloads client certificate file

### Response Generation: `server/response.go`
**Response struct** contains:
- `MTLSValid` - True if certificate chain was verified
- `PresentedCertificates` - Certificates presented by client
- `VerifiedChains` - Valid certificate chains (populated only if verification succeeded)
- `ClientCertificatePath` - Download link for demo certificate

Extracts certificate info from `r.TLS.PeerCertificates` and `r.TLS.VerifiedChains`.

### Testing
Tests in `server/response_test.go` verify response generation logic.

## Key Implementation Details

**mTLS Verification Flow**:
1. Server configured with CA cert pool from client CA PEM file
2. HTTP requests to HTTPS port include optional client certificates
3. Go's TLS stack compares client cert chain against CA pool
4. If valid, `r.TLS.VerifiedChains` is populated; otherwise empty

**Certificate Renewal**:
- ACME manager automatically handles Let's Encrypt certificate renewal
- HTTP server listens on port 80 for `/.well-known/acme-challenge/` paths
- No manual certificate management needed

**Staging vs Production**:
- Default: Production Let's Encrypt (`https://acme-v02.api.letsencrypt.org/directory`)
- Staging: `-staging` flag uses staging endpoint to avoid rate limits during testing

## Linting Configuration

`.golangci.yml` enables selective linters:
- Error checking: `errcheck`, `typecheck`, `govet`
- Code quality: `gocritic`, `gocyclo`, `gocognit`, `revive`
- Duplication: `dupl`
- Constants: `goconst`
- Unused code: `unused`, `ineffassign`, `unconvert`
- Format: `gofmt`

Run via Docker to avoid local installation dependency.

## Docker Build

Multi-stage Dockerfile:
1. **Builder stage**: Compiles Go binary with vendor dependencies
2. **Cert-builder stage**: Generates test certificates using cfssl
3. **Final stage**: Alpine-based with binary, site files, and test certificates

Requires files:
- `certgen/genca.sh` - Generates root CA
- `certgen/gencert.sh` - Generates client certificates
- `site/` - Directory with static files and `index.html` template

## Windows Development Notes

**Docker Volume Mounts**: On Windows with Git Bash, the Makefile automatically converts paths to the correct Docker format (`//c/Users/...`). If running Docker commands manually, use:
```bash
docker run --rm -v //c/Users/wouter.bon/mtls-server:/src -w /src <image>
```
instead of:
```bash
docker run --rm -v $(pwd):/src -w /src <image>  # This will fail on Windows
```

## Dependency Notes

- **Go 1.25** (upgraded from 1.22 for security fixes)
- `golang.org/x/crypto` v0.31.0 - For ACME and cryptographic operations
- Vendored dependencies (checked into repo via `vendor/` directory)
- Uses modules for dependency management (`go.mod`, `go.sum`)

### Security Status
- ✅ Zero critical vulnerabilities (as of 2026-02-28)
- All 11 initial Trivy vulnerabilities resolved
- Upgraded Go to fix 8 stdlib vulnerabilities
- Upgraded golang.org/x/crypto to fix SSH authorization bypass (CVE-2024-45337)
