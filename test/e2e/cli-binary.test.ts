/**
 * CLI E2E Tests — Binary Invocation
 *
 * Invokes the actual CLI binary via child_process.execFile() and asserts
 * stdout/stderr. Tests commands that don't require real funds or private keys.
 *
 * A Hono server is started on a random port with seeded test data.
 * The CLI is pointed at it via --server-url flag.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { serve } from '@hono/node-server';

// Import server internals via workspace-relative path
import { createApp } from '../../../server/src/index.js';
import { resetStore, getStore } from '../../../server/src/db/index.js';

const execFileAsync = promisify(execFile);

const CLI_BIN = 'node';
const CLI_ENTRY = new URL('../../bin/azeth.js', import.meta.url).pathname;

/** Run CLI command and return { stdout, stderr, exitCode } */
async function runCli(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(CLI_BIN, [CLI_ENTRY, ...args], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ...env,
      },
      timeout: 15_000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: execErr.stdout ?? '',
      stderr: execErr.stderr ?? '',
      exitCode: execErr.code ?? 1,
    };
  }
}

describe('CLI Binary E2E', () => {
  let server: ReturnType<typeof serve>;
  let serverPort: number;
  let serverUrl: string;

  beforeAll(async () => {
    // Create app and seed test data
    const app = createApp();
    resetStore();
    const store = getStore();

    // Seed test participants using the IDataStore interface
    await store.addParticipant({
      tokenId: 1001n,
      owner: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      entityType: 'service',
      name: 'Test Oracle',
      description: 'A test price oracle',
      capabilities: ['price-feed', 'analytics'],
      endpoint: 'https://test-oracle.azeth.ai/api',
      active: true,
    });
    await store.addParticipant({
      tokenId: 1002n,
      owner: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      entityType: 'agent',
      name: 'Trading Bot',
      description: 'Automated trading agent',
      capabilities: ['trading', 'analytics'],
      endpoint: 'https://trader.azeth.ai',
      active: true,
    });
    await store.addParticipant({
      tokenId: 1003n,
      owner: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      entityType: 'infrastructure',
      name: 'Bridge Node',
      description: 'Cross-chain bridge infrastructure',
      capabilities: ['bridge', 'relay'],
      endpoint: 'https://bridge.azeth.ai',
      active: true,
    });

    // Seed an interaction for reputation
    await store.addInteraction({
      id: crypto.randomUUID(),
      serviceTokenId: 1001n,
      callerAddress: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      success: true,
      responseTimeMs: 42,
      amount: 0n,
      endpoint: 'https://test-oracle.azeth.ai/api',
      timestamp: Date.now(),
    });

    // Start server on random port (port 0 = OS assigns)
    server = serve({
      fetch: app.fetch,
      port: 0,
    });

    // Get the assigned port
    const addr = server.address();
    if (typeof addr === 'object' && addr !== null) {
      serverPort = addr.port;
    } else {
      throw new Error('Failed to get server address');
    }
    serverUrl = `http://127.0.0.1:${serverPort}`;
  }, 15_000);

  afterAll(() => {
    if (server) server.close();
  });

  // ════════════════════════════════════
  // Version & Help
  // ════════════════════════════════════

  it('should show version', async () => {
    const { stdout, exitCode } = await runCli(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should show help', async () => {
    const { stdout, exitCode } = await runCli(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Azeth.ai CLI');
    expect(stdout).toContain('find');
    expect(stdout).toContain('discover');
    expect(stdout).toContain('status');
  });

  it('should show command-specific help', async () => {
    const { stdout, exitCode } = await runCli(['find', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('capability');
  });

  // ════════════════════════════════════
  // Discovery Commands (no auth needed)
  // ════════════════════════════════════

  it('should discover all services via "find" command', async () => {
    const { stdout, exitCode } = await runCli(
      ['find', '--server-url', serverUrl],
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Test Oracle');
  });

  it('should discover services by capability via "find" command', async () => {
    const { stdout, exitCode } = await runCli(
      ['find', '--capability', 'price-feed', '--server-url', serverUrl],
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Test Oracle');
  });

  it('should filter by entity type via "find" command', async () => {
    const { stdout, exitCode } = await runCli(
      ['find', '--type', 'agent', '--server-url', serverUrl],
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Trading Bot');
  });

  it('should discover services via "discover" command', async () => {
    const { stdout, exitCode } = await runCli(
      ['discover', '--capability', 'bridge', '--server-url', serverUrl],
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Bridge Node');
  });

  it('should show "no services found" for non-matching query', async () => {
    const { stdout, exitCode } = await runCli(
      ['find', '--capability', 'nonexistent-capability', '--server-url', serverUrl],
    );
    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toContain('no services found');
  });

  // ════════════════════════════════════
  // Status Command (requires key — test error path)
  // ════════════════════════════════════

  it('should fail status command without private key', async () => {
    const { stderr, exitCode } = await runCli(
      ['status', '--server-url', serverUrl],
      { AZETH_PRIVATE_KEY: '' },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Private key required');
  });

  // ════════════════════════════════════
  // Error Handling
  // ════════════════════════════════════

  it('should fail gracefully on unknown command', async () => {
    const { stderr, exitCode } = await runCli(['nonexistent']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('unknown command');
  });
});
