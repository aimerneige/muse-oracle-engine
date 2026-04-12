# Lovelive Manga Generator - Just 命令管理脚本

# 默认变量
bin_dir := "bin"
go_flags := ""

# 默认任务：列出所有可用命令
default:
    @just --list

# 构建所有二进制文件
build: (build_server) (build_generate)

# 构建 server 二进制文件
build_server:
    go build {{ go_flags }} -o {{ bin_dir }}/server ./cmd/server/main.go

# 构建 generate 二进制文件
build_generate:
    go build {{ go_flags }} -o {{ bin_dir }}/generate ./cmd/generate/main.go

# 以生产模式构建（禁用 CGO，指定 Linux 平台）
build_prod: (build_server_prod) (build_generate_prod)

build_server_prod:
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o {{ bin_dir }}/server ./cmd/server/main.go

build_generate_prod:
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o {{ bin_dir }}/generate ./cmd/generate/main.go

# 运行 server
run_server: build_server
    ./{{ bin_dir }}/server

# 运行 generate
run_generate *ARGS: build_generate
    ./{{ bin_dir }}/generate {{ ARGS }}

# 清理构建产物
clean:
    rm -rf {{ bin_dir }}

# 运行测试
test:
    go test ./...

# 运行测试（详细输出）
test_verbose:
    go test -v ./...

# 格式化代码
fmt:
    go fmt ./...

# 代码静态检查
lint:
    go vet ./...

# 下载依赖
deps:
    go mod download

# 整理依赖
tidy:
    go mod tidy

# 使用 Docker Compose 构建
docker_build:
    docker compose build

# 使用 Docker Compose 启动服务
docker_up:
    docker compose up -d

# 停止 Docker Compose 服务
docker_down:
    docker compose down

# 查看 Docker Compose 日志
docker_logs:
    docker compose logs -f

# 完整的 CI 检查流程
ci: fmt lint test build
