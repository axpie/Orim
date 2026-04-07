#!/usr/bin/env bash
# ORIM Installer — Linux & macOS
# Usage: bash install.sh  OR  curl -fsSL https://raw.githubusercontent.com/axpie/orim/main/install.sh | bash
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
else
  BOLD=''; GREEN=''; YELLOW=''; RED=''; NC=''
fi

info()    { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✖${NC}  $*" >&2; exit 1; }
heading() { echo -e "\n${BOLD}$*${NC}"; }

# ── Random helpers ────────────────────────────────────────────────────────────
gen_secret() {
  if command -v openssl &>/dev/null; then
    openssl rand -base64 36 | tr -d '\n/+='
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48
  fi
}

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ██████╗ ██████╗ ██╗███╗   ███╗"
echo "  ██╔═══██╗██╔══██╗██║████╗ ████║"
echo "  ██║   ██║██████╔╝██║██╔████╔██║"
echo "  ██║   ██║██╔══██╗██║██║╚██╔╝██║"
echo "  ╚██████╔╝██║  ██║██║██║ ╚═╝ ██║"
echo "   ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝     ╚═╝"
echo -e "${NC}  Collaborative Whiteboard — Installer\n"

# ── Pre-flight checks ─────────────────────────────────────────────────────────
heading "Checking requirements"

command -v docker &>/dev/null          || error "Docker is not installed. Get it at https://docs.docker.com/get-docker/"
docker info &>/dev/null 2>&1           || error "Docker is not running. Please start Docker Desktop and try again."
docker compose version &>/dev/null 2>&1 || error "Docker Compose is not available. Update Docker Desktop or install the plugin."
info "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"

# ── Choose install directory ───────────────────────────────────────────────────
heading "Install location"
DEFAULT_DIR="${HOME}/orim"
read -rp "  Install directory [${DEFAULT_DIR}]: " INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-${DEFAULT_DIR}}"

if [ -f "${INSTALL_DIR}/docker-compose.yml" ]; then
  warn "An existing installation was found at ${INSTALL_DIR}."
  read -rp "  Overwrite configuration and restart? [y/N]: " OVERWRITE
  [[ "${OVERWRITE,,}" == "y" ]] || { echo "Aborted."; exit 0; }
fi

mkdir -p "${INSTALL_DIR}"

# ── Configuration ─────────────────────────────────────────────────────────────
heading "Configuration"
echo "  Press Enter to accept the suggested value shown in brackets."
echo

SUGGESTED_PG="$(gen_secret | head -c 24)"
SUGGESTED_JWT="$(gen_secret)"

read -rp "  Admin password         [Admin123!]: " ADMIN_PASSWORD
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"

read -rp "  PostgreSQL password    [auto-generated]: " PG_PASSWORD
PG_PASSWORD="${PG_PASSWORD:-${SUGGESTED_PG}}"

read -rp "  JWT secret key         [auto-generated]: " JWT_KEY
JWT_KEY="${JWT_KEY:-${SUGGESTED_JWT}}"

read -rp "  Host port              [5000]: " PORT
PORT="${PORT:-5000}"

# ── Write docker-compose.yml ──────────────────────────────────────────────────
heading "Writing configuration"

cat > "${INSTALL_DIR}/docker-compose.yml" <<EOF
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: orim
      POSTGRES_PASSWORD: "${PG_PASSWORD}"
      POSTGRES_DB: orim
    volumes:
      - orim-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orim"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  orim:
    image: ghcr.io/axpie/orim:latest
    ports:
      - "${PORT}:5000"
    environment:
      ConnectionStrings__DefaultConnection: "Host=db;Port=5432;Database=orim;Username=orim;Password=${PG_PASSWORD}"
      Jwt__Key: "${JWT_KEY}"
      SeedAdmin__Password: "${ADMIN_PASSWORD}"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

volumes:
  orim-pgdata:
EOF

info "docker-compose.yml written to ${INSTALL_DIR}"

# ── Pull & start ──────────────────────────────────────────────────────────────
heading "Starting ORIM"
cd "${INSTALL_DIR}"

echo "  Pulling latest images…"
docker compose pull --quiet

echo "  Starting containers…"
docker compose up -d

# ── Wait for healthy ──────────────────────────────────────────────────────────
heading "Waiting for ORIM to become ready"
RETRIES=30
until curl -sf "http://localhost:${PORT}/health/live" &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "${RETRIES}" -le 0 ]; then
    warn "ORIM did not respond in time. Check logs with: docker compose -f ${INSTALL_DIR}/docker-compose.yml logs orim"
    break
  fi
  printf "."
  sleep 2
done
echo

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}${GREEN}ORIM is ready!${NC}"
echo
echo -e "  URL      ${BOLD}http://localhost:${PORT}${NC}"
echo -e "  Username ${BOLD}admin${NC}"
echo -e "  Password ${BOLD}${ADMIN_PASSWORD}${NC}"
echo
echo "  Manage:  docker compose -f ${INSTALL_DIR}/docker-compose.yml [stop|start|logs|pull]"
echo "  Update:  docker compose -f ${INSTALL_DIR}/docker-compose.yml pull && docker compose -f ${INSTALL_DIR}/docker-compose.yml up -d"
echo
