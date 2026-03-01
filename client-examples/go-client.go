package main

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

// Response represents the mTLS endpoint response
type Response struct {
	MTLSValid             bool          `json:"mtls_valid"`
	PresentedCertificates []interface{} `json:"presented_certificates"`
	VerifiedChains        []interface{} `json:"verified_chains"`
	Message               string        `json:"message,omitempty"`
	Timestamp             string        `json:"timestamp,omitempty"`
}

func main() {
	// Configuration
	const (
		baseURL = "https://mtls.nietst.uk"
		path    = "/api/certs"
	)

	certDir := filepath.Dir(os.Args[0])
	certFile := filepath.Join(certDir, "../client-cert.pem")
	keyFile := filepath.Join(certDir, "../client-key.pem")
	caFile := filepath.Join(certDir, "../ca.pem")

	fmt.Printf("\n🔐 mTLS Client (Go) - Connecting to %s%s\n\n", baseURL, path)

	// Load client certificate
	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		log.Fatalf("❌ Failed to load client certificate: %v", err)
	}

	// Load CA certificate
	caCert, err := os.ReadFile(caFile)
	if err != nil {
		log.Fatalf("❌ Failed to read CA certificate: %v", err)
	}

	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		log.Fatal("❌ Failed to parse CA certificate")
	}

	// Create TLS configuration with client certificate
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      caCertPool,
		// For testing with self-signed certs, set to false in production!
		InsecureSkipVerify: false,
	}

	// Create HTTP client with TLS config
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: tlsConfig,
		},
	}

	// Make request
	resp, err := client.Get(baseURL + path)
	if err != nil {
		fmt.Printf("❌ Request failed: %v\n", err)
		fmt.Println("\nTroubleshooting:")
		fmt.Println("1. Verify client certificate and key exist")
		fmt.Printf("   - %s\n", certFile)
		fmt.Printf("   - %s\n", keyFile)
		fmt.Println("2. Check DNS resolution:")
		fmt.Println("   nslookup mtls.nietst.uk")
		fmt.Println("3. Verify mTLS policy is active in Cloudflare Access")
		os.Exit(1)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Fatalf("❌ Failed to read response: %v", err)
	}

	// Print response
	fmt.Printf("✅ Status: %d\n", resp.StatusCode)
	fmt.Println("📋 Headers:")
	for name, values := range resp.Header {
		fmt.Printf("   %s: %v\n", name, values)
	}
	fmt.Println()

	// Parse and print JSON response
	var data Response
	if err := json.Unmarshal(body, &data); err != nil {
		fmt.Printf("📄 Response (raw): %s\n", string(body))
	} else {
		fmt.Println("📄 Response:")
		prettyJSON, _ := json.MarshalIndent(data, "", "  ")
		fmt.Println(string(prettyJSON))
		fmt.Println()

		if data.MTLSValid {
			fmt.Println("✅ mTLS Authentication: SUCCESS")
		} else {
			fmt.Println("❌ mTLS Authentication: FAILED")
		}
	}
}
