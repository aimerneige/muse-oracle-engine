# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the server and CLI binaries
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/server ./cmd/server/main.go
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/generate ./cmd/generate/main.go

# Final stage
FROM alpine:latest

WORKDIR /app

# Install ca-certificates (required for API requests) and tzdata (for timezone)
RUN apk add --no-cache ca-certificates tzdata

# Copy binaries from builder
COPY --from=builder /app/bin/server /usr/local/bin/server
COPY --from=builder /app/bin/generate /usr/local/bin/generate

# Set up default data directories
RUN mkdir -p /app/data /app/chardb /app/styles
ENV DATA_DIR=/app/data
ENV CHARDB_DIR=/app/chardb
ENV STYLES_DIR=/app/styles

# Expose API server port
EXPOSE 8080

# Run API server by default
CMD ["server"]
