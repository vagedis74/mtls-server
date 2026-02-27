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
