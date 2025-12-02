#!/bin/bash
#
# Deploy Script for NAS
#
# This script can be executed directly on the NAS or via SSH from GitHub Actions.
#
# Usage:
#   ./deploy.sh [options]
#
# Options:
#   --skip-build    Skip docker build (just restart containers)
#   --force         Force deployment even if there are no changes
#   --dry-run       Show what would be done without executing
#
# Environment variables:
#   NAS_APP_PATH    Path to the application (default: /mnt/user/appdata/hail_mary)
#
# Security notes:
# - This script should be run by a restricted user
# - The user should only have access to the app directory
# - The user should only be able to run docker commands
#

set -e

# Configuration
APP_PATH="${NAS_APP_PATH:-/mnt/user/appdata/hail_mary}"
SKIP_BUILD=false
FORCE=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Logging functions
log_info() {
  echo "ℹ️  $1"
}

log_success() {
  echo "✓ $1"
}

log_warn() {
  echo "⚠️  $1"
}

log_error() {
  echo "❌ $1"
}

log_step() {
  echo "→ $1"
}

# Execute command (respects dry-run mode)
execute() {
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would execute: $*"
    return 0
  fi
  "$@"
}

echo "═══════════════════════════════════════"
echo "  Deploy Script"
echo "═══════════════════════════════════════"
echo ""

# Validate environment
if [ ! -d "$APP_PATH" ]; then
  log_error "Application path does not exist: $APP_PATH"
  exit 1
fi

log_success "Application path: $APP_PATH"

# Change to application directory
cd "$APP_PATH" || {
  log_error "Failed to change to application directory"
  exit 1
}

# Step 1: Pull latest code
log_step "Pulling latest code from main branch..."
execute git pull origin main || {
  log_error "Git pull failed"
  exit 1
}
log_success "Code pulled successfully"

# Step 2: Stop existing containers
log_step "Stopping existing containers..."
execute docker compose down || {
  log_warn "docker compose down returned non-zero exit code (this may be normal)"
}
log_success "Containers stopped"

# Step 3: Build and start containers
if [ "$SKIP_BUILD" = true ]; then
  log_step "Starting containers (skip build mode)..."
  execute docker compose up -d || {
    log_error "docker compose up failed"
    exit 1
  }
else
  log_step "Building and starting containers..."
  execute docker compose up -d --build || {
    log_error "docker compose up --build failed"
    exit 1
  }
fi
log_success "Containers started"

# Step 4: Verify deployment
log_step "Verifying deployment..."
execute docker compose ps || {
  log_warn "Could not verify container status"
}

echo ""
echo "═══════════════════════════════════════"
echo "  DEPLOYMENT SUCCESSFUL"
echo "═══════════════════════════════════════"
echo ""

# Show running containers
log_info "Running containers:"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
