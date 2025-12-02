# 🤖 AI-Powered DevOps System

This repository includes an AI-powered automated maintenance and deployment system. It's designed to be safe, secure, and require human oversight at critical points.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         YOUR WORKFLOW                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Error Occurs    2. Run Auto-Fix    3. Review PR    4. Merge     │
│        │                  │                 │              │         │
│        ▼                  ▼                 ▼              ▼         │
│  ┌──────────┐      ┌───────────┐     ┌──────────┐   ┌──────────┐   │
│  │  Error   │ ──▶  │ Auto-Fix  │ ──▶ │  GitHub  │ ─▶│  Deploy  │   │
│  │   Log    │      │   Agent   │     │    PR    │   │   Agent  │   │
│  └──────────┘      └───────────┘     └──────────┘   └──────────┘   │
│        │                 │                │              │          │
│        │                 │                │              │          │
│        ▼                 ▼                ▼              ▼          │
│  debug/latest-   LLM (Gemini/     YOU REVIEW        SSH → NAS      │
│  error.txt       OpenAI/Claude)   THE CHANGES       docker up      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Golden Rules

### 1. ✅ Never Give Raw Credentials to the LLM

All secrets are stored as GitHub Secrets and read as environment variables. The agent **never** logs, prints, or sends credentials to any LLM.

### 2. ✅ Let the Agent Create PRs, But YOU Merge

The auto-fix agent creates PRs with proposed fixes. **You must review and merge them.** This prevents catastrophic automated changes.

### 3. ✅ Separate Fix Engine from Deploy Engine

| Agent | Purpose | Keys |
|-------|---------|------|
| Auto-Fix | Modifies code, creates PRs | GitHub token, LLM API key |
| Deploy | Handles NAS deployment | SSH key, NAS credentials |

No single bot holds all keys.

### 4. ✅ Limit SSH Permissions

Create a restricted deploy user on your NAS with:
- Access only to the application folder
- Docker permissions
- No root access or other system changes

## Quick Start

### Step 1: Add an Error Log

```bash
# Edit debug/latest-error.txt with your error
cat > debug/latest-error.txt << 'EOF'
Error: Build failed
TypeError: Cannot read property 'foo' of undefined
  at handleRequest (src/index.js:42:15)
EOF

git add debug/latest-error.txt
git commit -m "Add error log"
git push
```

### Step 2: Run Auto-Fix

1. Go to **Actions > Auto-Fix Agent**
2. Click **Run workflow**
3. Wait for the PR to be created

### Step 3: Review and Merge

1. Review the created PR carefully
2. Check that the proposed fix makes sense
3. Merge if correct

### Step 4: Automatic Deployment

Once merged, the deploy agent (if configured) will:
1. SSH to your NAS
2. Pull the latest code
3. Rebuild and restart containers

## Required Secrets

### Auto-Fix Agent

| Secret | Purpose |
|--------|---------|
| `GEMINI_API_KEY` | Google Gemini API (recommended, fastest) |
| `OPENAI_API_KEY` | OpenAI GPT-4 API (fallback) |
| `ANTHROPIC_API_KEY` | Claude API (fallback) |

At least one LLM API key is required.

### Deploy Agent (Optional)

| Secret | Purpose |
|--------|---------|
| `NAS_SSH_KEY` | Private SSH key for NAS access |
| `NAS_HOST` | NAS hostname or IP |
| `NAS_USER` | SSH username on NAS |
| `NAS_APP_PATH` | Path to app on NAS |

### Repository Variables

| Variable | Purpose |
|----------|---------|
| `DEPLOY_ENABLED` | Set to `true` to enable auto-deploy on merge |

## Directory Structure

```
tools/
├── auto-fix-agent/
│   ├── index.js        # Main auto-fix script
│   ├── package.json    # Dependencies
│   └── README.md       # Documentation
├── deploy-agent/
│   ├── deploy.js       # Node.js deploy agent
│   ├── deploy.sh       # Shell deploy script
│   ├── package.json    # Dependencies
│   └── README.md       # Documentation
debug/
├── latest-error.txt    # Current error log (edit this)
└── README.md           # Debug directory docs
.github/workflows/
├── auto-fix.yml        # Auto-fix GitHub Action
└── deploy.yml          # Deploy GitHub Action
```

## LLM Prompt Template

The auto-fix agent uses this prompt structure:

```
You are a senior software engineer tasked with fixing a bug or error in a codebase.

## Error Log / Build Failure
[error log content]

## Relevant Source Files
[source file contents]

## Instructions
1. Analyze the error log and identify the root cause
2. Propose a minimal fix that addresses the issue
3. Output your response as a unified diff
4. Only include the necessary changes
5. Include a brief explanation
```

## Security Features

| Feature | Implementation |
|---------|----------------|
| Secrets Protection | Env vars only, never logged |
| Human Review | PRs require manual merge |
| Separation of Concerns | Two separate agents |
| Minimal Permissions | Deploy user has limited access |
| SSH Key Authentication | No passwords |

## Dream Workflow

Once fully configured:

1. **Screenshot error** on your phone
2. **Upload** to `debug/latest-error.txt`
3. **Tap "Fix"** in GitHub Actions
4. **Wait** for PR creation
5. **Merge** the PR
6. **App redeploys** automatically

You've built your own AI-powered DevOps engineer. 🎉

## Troubleshooting

### Auto-Fix agent fails

1. Check that at least one LLM API key is configured
2. Ensure `debug/latest-error.txt` exists and has content
3. Check the Actions log for specific errors

### Deploy agent fails

1. Verify SSH key is correctly configured
2. Check that the deploy user has docker permissions
3. Test SSH connection manually: `ssh user@nas "docker ps"`

### PRs have wrong fixes

This is expected sometimes! LLMs aren't perfect. Always review PRs carefully and close them if the fix is wrong. Try adding more context to the error log.

## Contributing

To improve the auto-fix system:

1. Edit prompt template in `tools/auto-fix-agent/index.js`
2. Add more source files to `RELEVANT_FILES` array
3. Improve diff parsing in `parseDiffToFileChanges()`

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Anthropic API Documentation](https://docs.anthropic.com/)
