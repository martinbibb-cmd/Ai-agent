# Auto-Fix Agent

AI-powered maintenance agent that reads error logs and proposes code fixes via Pull Requests.

## Overview

This agent implements a safe, automated fix pipeline:

```
Error Logs → LLM Analysis → Code Patch → GitHub PR → YOU REVIEW → Merge → Deploy
```

The key security principle: **The agent creates PRs, but YOU review and merge them.**

## How It Works

1. **Error Detection**: Place your error logs in `debug/latest-error.txt`
2. **Trigger**: Run the Auto-Fix workflow (manually or via API)
3. **Analysis**: Agent reads error logs + relevant source files
4. **LLM Call**: Sends to LLM (priority: Gemini → OpenAI → Claude)
5. **Patch Generation**: LLM returns a unified diff
6. **PR Creation**: Agent creates a branch and opens a PR
7. **Review**: **YOU review the proposed changes**
8. **Merge**: If correct, merge the PR
9. **Deploy**: Deploy agent handles the NAS deployment

## Files

| File | Purpose |
|------|---------|
| `index.js` | Main agent script |
| `package.json` | Dependencies |

## Configuration

### Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `GITHUB_TOKEN` | *(Automatic)* GitHub token for creating branches/PRs |

### LLM API Keys (at least one required)

| Secret | Provider | Model |
|--------|----------|-------|
| `GEMINI_API_KEY` | Google | gemini-2.5-flash |
| `OPENAI_API_KEY` | OpenAI | gpt-4o |
| `ANTHROPIC_API_KEY` | Anthropic | claude-sonnet-4-20250514 |

The agent tries providers in order: **Gemini → OpenAI → Claude**

## Usage

### 1. Add Error Logs

Edit `debug/latest-error.txt` with your error/build logs:

```
Error: Build failed at 2024-01-15T10:30:00Z
TypeError: Cannot read property 'undefined' of null
  at handleRequest (src/index.js:142:15)
  at processQueue (src/index.js:88:7)
```

### 2. Commit and Push

```bash
git add debug/latest-error.txt
git commit -m "Add error logs for auto-fix"
git push
```

### 3. Run the Workflow

1. Go to **Actions > Auto-Fix Agent**
2. Click **Run workflow**
3. Optionally add a brief error description
4. Wait for the agent to create a PR

### 4. Review the PR

The agent will create a PR with:
- Explanation of what the fix does
- The unified diff that was applied
- Which LLM provider was used

**Always review carefully before merging!**

## Relevant Source Files

The agent analyzes these files by default:

- `src/index.js`
- `src/tools/definitions.js`
- `src/tools/handlers.js`
- `wrangler.toml`
- `package.json`

To modify this list, edit the `RELEVANT_FILES` array in `index.js`.

## Security Principles

1. **Secrets Never Exposed**: All API keys come from GitHub Secrets
2. **Secrets Never Logged**: The agent explicitly avoids logging secret values
3. **Human Review Required**: Agent creates PRs, humans merge them
4. **Separation of Concerns**: Auto-fix modifies code, deploy agent handles NAS

## Example Workflow Run

```
═══════════════════════════════════════
  Auto-Fix Agent
═══════════════════════════════════════

1. Checking environment variables...
✓ GITHUB_TOKEN is configured
✓ GITHUB_REPOSITORY is configured
✓ GEMINI_API_KEY is configured
○ OPENAI_API_KEY is not configured
○ ANTHROPIC_API_KEY is not configured

✓ Repository: username/repo

2. Reading error log...
✓ Read error log (542 characters)

3. Reading source files...
✓ Read source file: src/index.js
✓ Read source file: package.json

4. Calling LLM (priority: Gemini → OpenAI → Claude)...
→ Calling Gemini API...
✓ Gemini response received

5. Extracting diff from response...
✓ Explanation: The error occurs because...
✓ Diff extracted (15 lines)

6. Creating GitHub PR...
✓ Created branch: auto-fix/1234567890
✓ Applied changes to branch
✓ Created PR #42: https://github.com/...

═══════════════════════════════════════
  SUCCESS!
═══════════════════════════════════════

PR created: https://github.com/username/repo/pull/42

Please review the changes before merging.
```

## Troubleshooting

### "No LLM API keys configured"

Add at least one of `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` to your repository secrets.

### "Error log file not found"

Make sure `debug/latest-error.txt` exists and is committed to the repository.

### "No diff found in LLM response"

The LLM response didn't include a properly formatted diff. This can happen if:
- The error is too vague
- The source files don't contain enough context
- The LLM couldn't identify a fix

Try adding more context to the error log or including more relevant source files.

### PR contains wrong changes

This is why human review is mandatory! The LLM can make mistakes. Always review the diff carefully before merging.

## Integration with Deploy Agent

Once you merge an auto-fix PR, the deploy agent automatically:

1. Detects the merge to `main`
2. SSH connects to your NAS
3. Pulls the latest code
4. Rebuilds and restarts containers

See `tools/deploy-agent/README.md` for setup instructions.
