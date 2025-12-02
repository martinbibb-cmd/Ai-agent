/**
 * Auto-Fix Agent
 *
 * AI-powered maintenance agent that reads error logs and proposes code fixes via PRs.
 *
 * This agent:
 * 1. Reads error logs from debug/latest-error.txt
 * 2. Calls an LLM API (priority: Gemini → OpenAI → Claude) with the logs and relevant source files
 * 3. Asks for a unified diff that fixes the issue
 * 4. Creates a new branch, applies the diff, and opens a PR using the GitHub API
 *
 * Environment variables (from env vars, never logged):
 * - GITHUB_TOKEN: GitHub token for creating branches/PRs (required)
 * - GEMINI_API_KEY: Google Gemini API key (optional)
 * - OPENAI_API_KEY: OpenAI API key (optional)
 * - ANTHROPIC_API_KEY: Anthropic Claude API key (optional)
 * - GITHUB_REPOSITORY: Owner/repo format (required)
 */

import { Octokit } from '@octokit/rest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const ERROR_FILE_PATH = join(__dirname, '..', '..', 'debug', 'latest-error.txt');
const RELEVANT_FILES = [
  'src/index.js',
  'src/tools/definitions.js',
  'src/tools/handlers.js',
  'wrangler.toml',
  'package.json'
];

/**
 * Securely get environment variable (never logs the value)
 * @param {string} name - Environment variable name
 * @param {boolean} required - Whether the variable is required
 * @returns {string|undefined}
 */
function getEnvVar(name, required = false) {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  // Never log the actual value
  if (value) {
    console.log(`✓ ${name} is configured`);
  } else {
    console.log(`○ ${name} is not configured`);
  }
  return value;
}

/**
 * Read the error log file
 * @returns {string}
 */
function readErrorLog() {
  if (!existsSync(ERROR_FILE_PATH)) {
    throw new Error(`Error log file not found: ${ERROR_FILE_PATH}`);
  }

  const content = readFileSync(ERROR_FILE_PATH, 'utf-8');
  if (!content.trim()) {
    throw new Error('Error log file is empty');
  }

  console.log(`✓ Read error log (${content.length} characters)`);
  return content;
}

/**
 * Read relevant source files for context
 * @returns {Object<string, string>}
 */
function readSourceFiles() {
  const repoRoot = join(__dirname, '..', '..');
  const files = {};

  for (const filePath of RELEVANT_FILES) {
    const fullPath = join(repoRoot, filePath);
    if (existsSync(fullPath)) {
      files[filePath] = readFileSync(fullPath, 'utf-8');
      console.log(`✓ Read source file: ${filePath}`);
    } else {
      console.log(`○ Source file not found: ${filePath}`);
    }
  }

  return files;
}

/**
 * Build the prompt for the LLM
 * @param {string} errorLog - Error log content
 * @param {Object<string, string>} sourceFiles - Source file contents
 * @returns {string}
 */
function buildPrompt(errorLog, sourceFiles) {
  let prompt = `You are a senior software engineer tasked with fixing a bug or error in a codebase.

## Error Log / Build Failure

\`\`\`
${errorLog}
\`\`\`

## Relevant Source Files

`;

  for (const [filePath, content] of Object.entries(sourceFiles)) {
    prompt += `### ${filePath}

\`\`\`javascript
${content.slice(0, 5000)}${content.length > 5000 ? '\n... (truncated)' : ''}
\`\`\`

`;
  }

  prompt += `## Instructions

1. Analyze the error log and identify the root cause
2. Propose a minimal fix that addresses the issue
3. Output your response as a unified diff that can be applied with \`git apply\`
4. Only include the necessary changes - keep the diff minimal
5. Include a brief explanation of what the fix does

## Response Format

Start your response with a brief explanation (1-2 sentences), then provide the unified diff:

\`\`\`diff
--- a/path/to/file
+++ b/path/to/file
@@ -line,count +line,count @@
 context
-removed line
+added line
 context
\`\`\`
`;

  return prompt;
}

/**
 * Call Gemini API
 * @param {string} apiKey - API key
 * @param {string} prompt - Prompt to send
 * @returns {Promise<string>}
 */
async function callGemini(apiKey, prompt) {
  console.log('→ Calling Gemini API...');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Gemini returned empty response');
  }

  console.log('✓ Gemini response received');
  return text;
}

/**
 * Call OpenAI API
 * @param {string} apiKey - API key
 * @param {string} prompt - Prompt to send
 * @returns {Promise<string>}
 */
async function callOpenAI(apiKey, prompt) {
  console.log('→ Calling OpenAI API...');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('OpenAI returned empty response');
  }

  console.log('✓ OpenAI response received');
  return text;
}

/**
 * Call Claude API
 * @param {string} apiKey - API key
 * @param {string} prompt - Prompt to send
 * @returns {Promise<string>}
 */
async function callClaude(apiKey, prompt) {
  console.log('→ Calling Claude API...');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;

  if (!text) {
    throw new Error('Claude returned empty response');
  }

  console.log('✓ Claude response received');
  return text;
}

/**
 * Call LLM with priority: Gemini → OpenAI → Claude
 * @param {string} prompt - Prompt to send
 * @param {Object} apiKeys - Object containing API keys
 * @returns {Promise<{response: string, provider: string}>}
 */
async function callLLM(prompt, apiKeys) {
  const providers = [
    { name: 'Gemini', key: apiKeys.gemini, fn: callGemini },
    { name: 'OpenAI', key: apiKeys.openai, fn: callOpenAI },
    { name: 'Claude', key: apiKeys.anthropic, fn: callClaude }
  ];

  for (const provider of providers) {
    if (provider.key) {
      try {
        const response = await provider.fn(provider.key, prompt);
        return { response, provider: provider.name };
      } catch (error) {
        console.error(`✗ ${provider.name} failed: ${error.message}`);
        // Try next provider
      }
    }
  }

  throw new Error('All LLM providers failed or no API keys configured');
}

/**
 * Extract the diff from the LLM response
 * @param {string} response - LLM response
 * @returns {{explanation: string, diff: string}}
 */
function extractDiff(response) {
  const diffMatch = response.match(/```diff\n([\s\S]*?)```/);

  if (!diffMatch) {
    throw new Error('No diff found in LLM response');
  }

  const diff = diffMatch[1].trim();
  const explanation = response.substring(0, diffMatch.index).trim();

  return { explanation, diff };
}

/**
 * Create a GitHub PR with the proposed fix
 * @param {Octokit} octokit - GitHub API client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} explanation - Fix explanation
 * @param {string} diff - Unified diff
 * @param {string} provider - LLM provider used
 * @returns {Promise<Object>}
 */
async function createFixPR(octokit, owner, repo, explanation, diff, provider) {
  console.log('→ Creating fix PR on GitHub...');

  // Get the default branch
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  // Get the latest commit SHA from the default branch
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`
  });
  const baseSha = refData.object.sha;

  // Create a new branch
  const branchName = `auto-fix/${Date.now()}`;
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha
  });
  console.log(`✓ Created branch: ${branchName}`);

  // Parse the diff and apply changes
  // For simplicity, we'll create a commit with the diff in the PR description
  // In a production system, you'd parse the diff and create actual file changes

  // Create a placeholder commit to make the PR valid
  // Extract file paths from the diff
  const fileChanges = parseDiffToFileChanges(diff);

  if (fileChanges.length === 0) {
    throw new Error('Could not parse file changes from diff');
  }

  // Get the tree for the base commit
  const { data: baseCommit } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha
  });

  // Create blobs for each changed file
  const treeItems = [];
  for (const change of fileChanges) {
    const { data: blob } = await octokit.git.createBlob({
      owner,
      repo,
      content: change.newContent,
      encoding: 'utf-8'
    });

    treeItems.push({
      path: change.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    });
  }

  // Create new tree
  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree: treeItems
  });

  // Create commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message: `fix: auto-generated fix from error log\n\nGenerated by auto-fix-agent using ${provider}`,
    tree: newTree.sha,
    parents: [baseSha]
  });

  // Update branch to point to new commit
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
    sha: newCommit.sha
  });

  console.log(`✓ Applied changes to branch`);

  // Create the PR
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: '🤖 Auto-fix: Error resolution',
    head: branchName,
    base: defaultBranch,
    body: `## Auto-Generated Fix

This PR was automatically generated by the auto-fix-agent.

### LLM Provider Used
${provider}

### Explanation
${explanation}

### Proposed Diff
\`\`\`diff
${diff}
\`\`\`

---
⚠️ **Please review carefully before merging.**
`
  });

  console.log(`✓ Created PR #${pr.number}: ${pr.html_url}`);
  return pr;
}

/**
 * Parse unified diff to extract file changes
 * @param {string} diff - Unified diff string
 * @returns {Array<{path: string, newContent: string}>}
 */
function parseDiffToFileChanges(diff) {
  const changes = [];
  const lines = diff.split('\n');
  const repoRoot = join(__dirname, '..', '..');

  let currentFile = null;
  let originalContent = [];
  let hunks = [];
  let currentHunk = null;

  for (const line of lines) {
    // Match file header: +++ b/path/to/file
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      // Process previous file if exists
      if (currentFile && hunks.length > 0) {
        const newContent = applyHunks(originalContent, hunks);
        changes.push({
          path: currentFile,
          newContent: newContent.join('\n')
        });
      }

      currentFile = fileMatch[1];
      hunks = [];
      currentHunk = null;

      // Read the original file content
      const fullPath = join(repoRoot, currentFile);
      if (existsSync(fullPath)) {
        originalContent = readFileSync(fullPath, 'utf-8').split('\n');
      } else {
        originalContent = [];
      }
      continue;
    }

    // Match hunk header: @@ -start,count +start,count @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] || '1', 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] || '1', 10),
        lines: []
      };
      hunks.push(currentHunk);
      continue;
    }

    // Process diff lines within a hunk
    if (currentHunk) {
      if (line.startsWith('+')) {
        // Added line
        currentHunk.lines.push({ type: 'add', content: line.slice(1) });
      } else if (line.startsWith('-')) {
        // Removed line
        currentHunk.lines.push({ type: 'remove', content: line.slice(1) });
      } else if (line.startsWith(' ') || line === '') {
        // Context line
        currentHunk.lines.push({ type: 'context', content: line.slice(1) || '' });
      }
    }
  }

  // Process last file
  if (currentFile && hunks.length > 0) {
    const newContent = applyHunks(originalContent, hunks);
    changes.push({
      path: currentFile,
      newContent: newContent.join('\n')
    });
  }

  return changes;
}

/**
 * Apply hunks to original content
 * @param {string[]} originalLines - Original file lines
 * @param {Array} hunks - Array of hunk objects
 * @returns {string[]} - Modified file lines
 */
function applyHunks(originalLines, hunks) {
  // Work with a copy of the original lines
  let result = [...originalLines];
  let offset = 0; // Track line number changes due to insertions/deletions

  for (const hunk of hunks) {
    const startIdx = hunk.oldStart - 1 + offset; // Convert to 0-based index
    let currentIdx = startIdx;
    let linesToRemove = 0;
    const linesToAdd = [];

    for (const line of hunk.lines) {
      if (line.type === 'remove') {
        linesToRemove++;
      } else if (line.type === 'add') {
        linesToAdd.push(line.content);
      } else if (line.type === 'context') {
        // For context lines, we need to handle accumulated changes
        if (linesToRemove > 0 || linesToAdd.length > 0) {
          result.splice(currentIdx, linesToRemove, ...linesToAdd);
          currentIdx += linesToAdd.length;
          offset += linesToAdd.length - linesToRemove;
          linesToRemove = 0;
          linesToAdd.length = 0;
        }
        currentIdx++;
      }
    }

    // Apply any remaining changes
    if (linesToRemove > 0 || linesToAdd.length > 0) {
      result.splice(currentIdx, linesToRemove, ...linesToAdd);
      offset += linesToAdd.length - linesToRemove;
    }
  }

  return result;
}

/**
 * Main function
 */
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Auto-Fix Agent');
  console.log('═══════════════════════════════════════\n');

  try {
    // 1. Load and validate environment variables
    console.log('1. Checking environment variables...');
    const githubToken = getEnvVar('GITHUB_TOKEN', true);
    const repository = getEnvVar('GITHUB_REPOSITORY', true);
    const geminiKey = getEnvVar('GEMINI_API_KEY', false);
    const openaiKey = getEnvVar('OPENAI_API_KEY', false);
    const anthropicKey = getEnvVar('ANTHROPIC_API_KEY', false);

    if (!geminiKey && !openaiKey && !anthropicKey) {
      throw new Error('At least one LLM API key must be configured (GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY)');
    }

    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      throw new Error('GITHUB_REPOSITORY must be in format owner/repo');
    }

    console.log(`\n✓ Repository: ${owner}/${repo}\n`);

    // 2. Read error log
    console.log('2. Reading error log...');
    const errorLog = readErrorLog();
    console.log();

    // 3. Read relevant source files
    console.log('3. Reading source files...');
    const sourceFiles = readSourceFiles();
    console.log();

    // 4. Build prompt and call LLM
    console.log('4. Calling LLM (priority: Gemini → OpenAI → Claude)...');
    const prompt = buildPrompt(errorLog, sourceFiles);
    const { response, provider } = await callLLM(prompt, {
      gemini: geminiKey,
      openai: openaiKey,
      anthropic: anthropicKey
    });
    console.log();

    // 5. Extract diff from response
    console.log('5. Extracting diff from response...');
    const { explanation, diff } = extractDiff(response);
    console.log(`✓ Explanation: ${explanation.substring(0, 100)}...`);
    console.log(`✓ Diff extracted (${diff.split('\n').length} lines)`);
    console.log();

    // 6. Create PR
    console.log('6. Creating GitHub PR...');
    const octokit = new Octokit({ auth: githubToken });
    const pr = await createFixPR(octokit, owner, repo, explanation, diff, provider);
    console.log();

    console.log('═══════════════════════════════════════');
    console.log('  SUCCESS!');
    console.log('═══════════════════════════════════════');
    console.log(`\nPR created: ${pr.html_url}`);
    console.log(`\nPlease review the changes before merging.\n`);

  } catch (error) {
    console.error('\n═══════════════════════════════════════');
    console.error('  ERROR');
    console.error('═══════════════════════════════════════');
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
}

main();
