# Debug Directory

This directory contains error logs and debug information used by the auto-fix agent.

## Files

- **latest-error.txt**: The latest error log to be analyzed by the auto-fix agent

## Usage

1. When you encounter a build failure, container crash, or other error:
   - Copy the error logs/stack traces into `debug/latest-error.txt`
   - Commit and push the file to the repository

2. Run the auto-fix agent:
   - Go to **Actions** > **Auto-Fix Agent**
   - Click **Run workflow**
   - Optionally add a brief error description
   - Wait for the agent to create a PR with the proposed fix

3. Review and merge:
   - Check the PR created by the agent
   - Review the proposed changes carefully
   - Merge if the fix looks correct

## Best Practices

- Include as much context as possible in the error log
- Include the full stack trace when available
- Include any relevant error codes or messages
- Clear the file or replace it before the next run
