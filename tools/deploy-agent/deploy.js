/**
 * Deploy Agent
 *
 * Secure deployment agent for NAS/Docker environments.
 *
 * This agent is SEPARATE from the auto-fix agent:
 * - Auto-fix agent: modifies code, creates PRs
 * - Deploy agent: handles NAS/server deployments via SSH
 *
 * Security principles:
 * 1. NEVER logs credentials or SSH keys
 * 2. Uses environment variables for all secrets
 * 3. Executes only in designated paths
 * 4. Limited to specific Docker commands
 *
 * Environment variables (from secrets, never logged):
 * - NAS_HOST: NAS hostname or IP address
 * - NAS_USER: SSH username for NAS
 * - NAS_APP_PATH: Path to application on NAS
 * - SSH_PRIVATE_KEY: (used by webfactory/ssh-agent in GitHub Actions)
 */

import { spawn } from 'child_process';

// Configuration (from environment variables)
const config = {
  host: process.env.NAS_HOST,
  user: process.env.NAS_USER,
  appPath: process.env.NAS_APP_PATH || '/mnt/user/appdata/hail_mary',
  skipBuild: process.env.SKIP_BUILD === 'true',
  dryRun: process.env.DRY_RUN === 'true',
};

/**
 * Log a message (safe - never logs secrets)
 * @param {string} message - Message to log
 * @param {string} level - Log level (info, warn, error, success)
 */
function log(message, level = 'info') {
  const icons = {
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
    success: '✓',
    step: '→',
  };
  const icon = icons[level] || icons.info;
  console.log(`${icon} ${message}`);
}

/**
 * Validate environment configuration
 * @returns {boolean} - True if configuration is valid
 */
function validateConfig() {
  const required = ['host', 'user', 'appPath'];
  const missing = [];

  // Check required vars (never log the actual values)
  if (!config.host) {
    missing.push('NAS_HOST');
  } else {
    log('NAS_HOST is configured', 'success');
  }

  if (!config.user) {
    missing.push('NAS_USER');
  } else {
    log('NAS_USER is configured', 'success');
  }

  if (!config.appPath) {
    missing.push('NAS_APP_PATH');
  } else {
    log(`NAS_APP_PATH is configured: ${config.appPath}`, 'success');
  }

  if (missing.length > 0) {
    log(`Missing required environment variables: ${missing.join(', ')}`, 'error');
    return false;
  }

  return true;
}

/**
 * Execute SSH command on the NAS
 * @param {string} command - Command to execute
 * @param {Object} options - Execution options
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function sshExec(command, options = {}) {
  const { timeout = 300000 } = options; // 5 minute default timeout

  if (config.dryRun) {
    log(`[DRY RUN] Would execute: ${command}`, 'info');
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  return new Promise((resolve, reject) => {
    const sshCommand = `ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 ${config.user}@${config.host} "${command}"`;

    log(`Executing: ${command}`, 'step');

    const proc = spawn('bash', ['-c', sshCommand], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Deploy the application
 * This executes the deployment steps on the NAS
 */
async function deploy() {
  log('Starting deployment...', 'info');

  // Step 1: Navigate to app directory and pull latest code
  log('Pulling latest code...', 'step');
  const pullResult = await sshExec(`cd ${config.appPath} && git pull origin main`);
  if (pullResult.exitCode !== 0) {
    throw new Error(`Git pull failed with exit code ${pullResult.exitCode}`);
  }

  // Step 2: Stop existing containers
  log('Stopping existing containers...', 'step');
  const downResult = await sshExec(`cd ${config.appPath} && docker compose down`);
  if (downResult.exitCode !== 0) {
    log('Warning: docker compose down returned non-zero exit code', 'warn');
  }

  // Step 3: Build and start containers (or just restart if skip_build)
  if (config.skipBuild) {
    log('Restarting containers (skip build mode)...', 'step');
    const restartResult = await sshExec(`cd ${config.appPath} && docker compose up -d`);
    if (restartResult.exitCode !== 0) {
      throw new Error(`Docker compose up failed with exit code ${restartResult.exitCode}`);
    }
  } else {
    log('Building and starting containers...', 'step');
    const buildResult = await sshExec(`cd ${config.appPath} && docker compose up -d --build`);
    if (buildResult.exitCode !== 0) {
      throw new Error(`Docker compose up --build failed with exit code ${buildResult.exitCode}`);
    }
  }

  // Step 4: Verify containers are running
  log('Verifying deployment...', 'step');
  const psResult = await sshExec(`cd ${config.appPath} && docker compose ps`);
  if (psResult.exitCode !== 0) {
    log('Warning: Could not verify container status', 'warn');
  }

  log('Deployment completed successfully!', 'success');
}

/**
 * Main function
 */
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Deploy Agent');
  console.log('═══════════════════════════════════════\n');

  try {
    // 1. Validate configuration
    log('1. Validating configuration...', 'info');
    if (!validateConfig()) {
      console.log();
      log('Configuration validation failed.', 'error');
      log('Please configure the following GitHub Secrets:', 'info');
      log('  - NAS_SSH_KEY: Private SSH key with access to NAS', 'info');
      log('  - NAS_HOST: NAS hostname or IP address', 'info');
      log('  - NAS_USER: SSH username for NAS', 'info');
      log('  - NAS_APP_PATH: Path to app on NAS (optional, defaults to /mnt/user/appdata/hail_mary)', 'info');
      process.exit(1);
    }
    console.log();

    // 2. Execute deployment
    log('2. Executing deployment...', 'info');
    await deploy();
    console.log();

    console.log('═══════════════════════════════════════');
    console.log('  DEPLOYMENT SUCCESSFUL');
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('\n═══════════════════════════════════════');
    console.error('  DEPLOYMENT FAILED');
    console.error('═══════════════════════════════════════');
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
}

main();
