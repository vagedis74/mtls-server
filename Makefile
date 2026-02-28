# Detect OS and set Docker volume path accordingly
ifeq ($(OS),Windows_NT)
	# Windows: use //c/... format for Docker volume mounts
	DOCKER_VOL := //$(subst \,/,$(CURDIR))
else
	# Unix-like: use standard path
	DOCKER_VOL := $(CURDIR)
endif

.PHONY: build
build:
	go build -mod=vendor ./cmd/mtls-server

.PHONY: gofmt
deploy:
	go fmt ./

.PHONY: vendor
vendor:
	go mod tidy
	go mod vendor

.PHONY: test
test:
	go test ./server

.PHONY: docker
docker:
	docker build -t mtls-server .

.PHONY: lint
lint:
	docker run --rm -it \
		-v $(DOCKER_VOL):/src \
		-w /src \
		golangci/golangci-lint:v1.56 golangci-lint run \
		-v -c .golangci.yml

.PHONY: upgrade-vendor
upgrade-vendor:
	go get -u ./...

# Rust mTLS Server targets
.PHONY: certs
certs:
	openssl genrsa -out ca-key.pem 4096
	openssl req -new -x509 -days 3650 -key ca-key.pem -subj "/CN=Test CA/O=mTLS Test" -out ca.pem
	openssl genrsa -out key.pem 2048
	openssl req -new -key key.pem -subj "/CN=127.0.0.1/O=mTLS Test" -out server.csr
	openssl x509 -req -days 365 -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -extfile server-ext.cnf -out cert.pem
	openssl genrsa -out client-key.pem 2048
	openssl req -new -key client-key.pem -subj "/CN=Test Client/O=mTLS Test" -out client.csr
	openssl x509 -req -days 365 -in client.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -extfile client-ext.cnf -out client-cert.pem
	rm -f server.csr client.csr ca.srl

.PHONY: clean-certs
clean-certs:
	rm -f ca.pem ca-key.pem cert.pem key.pem client-cert.pem client-key.pem

.PHONY: cargo-build
cargo-build:
	cargo build

.PHONY: cargo-run
cargo-run:
	cargo run
