# Deploy Agent

Secure deployment agent for NAS/Docker environments. This agent is **completely separate** from the auto-fix agent to maintain security boundaries.

## Architecture

```
Auto-Fix Agent           Deploy Agent
     │                       │
     ▼                       ▼
  Modifies Code        Handles Deployment
     │                       │
     ▼                       ▼
  Creates PR           SSH → NAS
     │                       │
     ▼                       ▼
  YOU REVIEW & MERGE    docker compose
```

## Security Principles

1. **Separation of Concerns**: Auto-fix modifies code → Deploy handles NAS
2. **No Single Bot Holds All Keys**: The deploy agent only has deployment access
3. **You Merge**: Auto-fix creates PRs, but YOU review and merge them
4. **Secrets Never Exposed**: All credentials come from GitHub Secrets

## Files

| File | Purpose |
|------|---------|
| `deploy.js` | Node.js deployment agent (runs in GitHub Actions) |
| `deploy.sh` | Shell script (can be run directly on NAS or via SSH) |

## GitHub Actions Workflow

The deploy workflow (`.github/workflows/deploy.yml`) is triggered:
- **Automatically**: On merge to `main` branch (if `DEPLOY_ENABLED=true`)
- **Manually**: Via workflow_dispatch (click "Run workflow" in Actions)

## Setup Instructions

### 1. Create a Deploy User on Your NAS

For Unraid/Linux NAS:

```bash
# Create a restricted deploy user
sudo useradd -m -s /bin/bash deploy

# Add to docker group
sudo usermod -aG docker deploy

# Create .ssh directory
sudo mkdir -p /home/deploy/.ssh
sudo chown deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
```

### 2. Generate SSH Key

On your local machine:

```bash
# Generate an Ed25519 key (more secure than RSA)
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github-deploy

# This creates:
# - ~/.ssh/github-deploy (private key - goes to GitHub Secrets)
# - ~/.ssh/github-deploy.pub (public key - goes to NAS)
```

### 3. Add Public Key to NAS

```bash
# Copy public key to NAS authorized_keys
cat ~/.ssh/github-deploy.pub | ssh your-nas-user@your-nas-ip "cat >> ~/.ssh/authorized_keys"

# Or manually add to /home/deploy/.ssh/authorized_keys on NAS
```

### 4. Configure GitHub Secrets

Go to **Repository Settings > Secrets and variables > Actions** and add:

| Secret | Value |
|--------|-------|
| `NAS_SSH_KEY` | Contents of `~/.ssh/github-deploy` (the private key) |
| `NAS_HOST` | Your NAS IP or hostname (e.g., `192.168.1.100`) |
| `NAS_USER` | `deploy` (or your deploy username) |
| `NAS_APP_PATH` | `/mnt/user/appdata/hail_mary` (path to your app) |

### 5. Enable Automatic Deployment

Go to **Repository Settings > Secrets and variables > Actions > Variables** and add:

| Variable | Value |
|----------|-------|
| `DEPLOY_ENABLED` | `true` |

## Usage

### Manual Deployment

1. Go to **Actions > Deploy to NAS**
2. Click **Run workflow**
3. Optionally check:
   - **Skip docker build**: Just restart containers without rebuilding
   - **Dry run mode**: Show commands without executing

### Automatic Deployment

Once configured with `DEPLOY_ENABLED=true`, deployments happen automatically on merge to `main`.

## The Complete Flow

```
1. Error occurs in production
   ↓
2. Copy error to debug/latest-error.txt
   ↓
3. Run Auto-Fix Agent (Actions > Auto-Fix Agent)
   ↓
4. Agent creates PR with proposed fix
   ↓
5. YOU review the PR
   ↓
6. YOU merge the PR (if the fix is correct)
   ↓
7. Deploy Agent automatically deploys to NAS
   ↓
8. Stack is rebuilt and running
```

## Direct Usage on NAS

You can also run `deploy.sh` directly on your NAS:

```bash
# Navigate to app directory
cd /mnt/user/appdata/hail_mary

# Run deployment
./tools/deploy-agent/deploy.sh

# Skip build (just restart)
./tools/deploy-agent/deploy.sh --skip-build

# Dry run
./tools/deploy-agent/deploy.sh --dry-run
```

## Security Recommendations

1. **Restrict SSH Access**: Limit the deploy user to specific commands
2. **Use Key Authentication Only**: Disable password authentication
3. **Limit Directory Access**: Deploy user should only access the app directory
4. **Audit Logs**: Enable SSH logging on your NAS
5. **Regular Key Rotation**: Rotate SSH keys periodically

### Example: Restrict SSH Commands (Optional)

Add to NAS `/home/deploy/.ssh/authorized_keys`:

```
command="cd /mnt/user/appdata/hail_mary && git pull && docker compose down && docker compose up -d --build",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 AAAAC3... github-deploy
```

This locks the key to only running the deploy commands.
