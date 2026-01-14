/**
 * Works GitHub Action
 * 
 * Syncs GitHub activity with Works work tracking:
 * - Auto-detect work IDs from commit messages [WORK-ID]
 * - Mark work complete when PRs are merged
 * - Report progress from CI status
 * - Generate AGENTS.md for issues
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import fetch from 'node-fetch';

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

let requestId = 0;

async function callMCP(
  serverUrl: string,
  apiKey: string,
  method: string,
  params?: Record<string, any>
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${serverUrl}/api/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++requestId,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = (await response.json()) as MCPResponse;

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.result;
}

async function callTool(
  serverUrl: string,
  apiKey: string,
  name: string,
  args: Record<string, any>
): Promise<any> {
  const result = await callMCP(serverUrl, apiKey, 'tools/call', {
    name,
    arguments: args,
  });

  if (result?.structuredContent) {
    return result.structuredContent;
  }

  if (result?.content?.[0]?.text) {
    try {
      return JSON.parse(result.content[0].text);
    } catch {
      return { text: result.content[0].text };
    }
  }

  return result;
}

// Extract work ID from commit message or PR title
// Format: [cmj2r7f3e0029f7m0cgak7ccr] or [WORK-cmj2r7f3e0029f7m0cgak7ccr]
function extractWorkId(text: string): string | null {
  const match = text.match(/\[(?:WORK-)?([a-z0-9]{20,30})\]/i);
  return match ? match[1] : null;
}

async function run(): Promise<void> {
  try {
    const serverUrl = core.getInput('server-url', { required: true });
    const apiKey = core.getInput('api-key') || '';
    const action = core.getInput('action', { required: true });
    let workId = core.getInput('work-id') || '';

    const context = github.context;

    // Auto-detect work ID from context
    if (!workId) {
      if (context.eventName === 'push') {
        // Check commit messages
        const commits = context.payload.commits || [];
        for (const commit of commits) {
          const id = extractWorkId(commit.message);
          if (id) {
            workId = id;
            core.info(`Detected work ID from commit: ${workId}`);
            break;
          }
        }
      } else if (context.eventName === 'pull_request') {
        // Check PR title
        const pr = context.payload.pull_request;
        if (pr) {
          const id = extractWorkId(pr.title) || extractWorkId(pr.body || '');
          if (id) {
            workId = id;
            core.info(`Detected work ID from PR: ${workId}`);
          }
        }
      }
    }

    if (!workId && action !== 'sync') {
      core.setFailed('No work ID provided or detected');
      return;
    }

    switch (action) {
      case 'sync': {
        // Sync event - detect and update work based on GitHub event
        if (context.eventName === 'pull_request') {
          const pr = context.payload.pull_request;
          if (pr?.merged && workId) {
            // PR merged - mark work complete
            const files = core.getInput('files')?.split(',').map(f => f.trim()) || [];
            await callTool(serverUrl, apiKey, 'mark_complete', {
              workId,
              summary: `Merged PR #${pr.number}: ${pr.title}`,
              files,
              pullRequestUrl: pr.html_url,
            });
            core.info(`Marked work ${workId} as complete (PR merged)`);
            core.setOutput('status', 'COMPLETED');
          } else if (workId) {
            // PR opened/updated - report progress
            await callTool(serverUrl, apiKey, 'report_progress', {
              workId,
              progress: 75,
              message: `PR #${pr?.number} opened: ${pr?.title}`,
            });
            core.info(`Reported progress for work ${workId}`);
            core.setOutput('status', 'IN_PROGRESS');
          }
        } else if (context.eventName === 'push' && workId) {
          // Push - report progress
          const commits = context.payload.commits || [];
          await callTool(serverUrl, apiKey, 'report_progress', {
            workId,
            progress: 50,
            message: `${commits.length} commit(s) pushed`,
          });
          core.info(`Reported progress for work ${workId}`);
          core.setOutput('status', 'IN_PROGRESS');
        }
        break;
      }

      case 'complete': {
        const summary = core.getInput('summary') || 'Completed via GitHub Action';
        const files = core.getInput('files')?.split(',').map(f => f.trim()) || [];
        
        let prUrl: string | undefined;
        if (context.eventName === 'pull_request') {
          prUrl = context.payload.pull_request?.html_url;
        }

        await callTool(serverUrl, apiKey, 'mark_complete', {
          workId,
          summary,
          files: files.length > 0 ? files : undefined,
          pullRequestUrl: prUrl,
        });
        
        core.info(`Marked work ${workId} as complete`);
        core.setOutput('status', 'COMPLETED');
        break;
      }

      case 'progress': {
        const progress = parseInt(core.getInput('progress') || '50', 10);
        const message = core.getInput('summary') || 'Progress update from CI';

        await callTool(serverUrl, apiKey, 'report_progress', {
          workId,
          progress,
          message,
        });

        core.info(`Reported ${progress}% progress for work ${workId}`);
        core.setOutput('status', 'IN_PROGRESS');
        break;
      }

      case 'init': {
        // Get AGENTS.md content for a work item
        const result = await callMCP(serverUrl, apiKey, 'tools/call', {
          name: 'get_work_context',
          arguments: { workId },
        });

        const agentsMd = result?.content?.[0]?.text || '';
        core.setOutput('agents-md', agentsMd);
        core.info(`Retrieved AGENTS.md for work ${workId}`);
        break;
      }

      default:
        core.setFailed(`Unknown action: ${action}`);
        return;
    }

    core.setOutput('work-id', workId);
  } catch (error: any) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();
