import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('@azeth/sdk', () => ({
  AzethKit: {
    create: vi.fn().mockResolvedValue({
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' as `0x${string}`,
      destroy: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

vi.mock('ora', () => ({
  default: vi.fn().mockReturnValue({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    text: '',
  }),
}));

describe('find command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    delete process.env['AZETH_PRIVATE_KEY'];
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  it('displays search results in a table', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: [
          { tokenId: '1', owner: '0xAABB', entityType: 'service', name: 'SwapService', capabilities: ['swap'] },
          { tokenId: '2', owner: '0xCCDD', entityType: 'agent', name: 'DataAgent', capabilities: ['market-data'] },
        ],
      })),
    });

    const { findCommand } = await import('../../src/commands/find.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL', 'http://localhost:3000');

    program.addCommand(findCommand);

    await program.parseAsync(
      ['find', 'swap'],
      { from: 'user' },
    );

    const allOutput = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    const stripped = allOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('Found 2');
  });

  it('displays message when no results', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: [] })),
    });

    const { findCommand } = await import('../../src/commands/find.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL', 'http://localhost:3000');

    program.addCommand(findCommand);

    await program.parseAsync(
      ['find', '--capability', 'nonexistent'],
      { from: 'user' },
    );

    const allOutput = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    const stripped = allOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('No services found');
  });

  it('handles API errors gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { findCommand } = await import('../../src/commands/find.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL', 'http://localhost:3000');

    program.addCommand(findCommand);

    await program.parseAsync(
      ['find'],
      { from: 'user' },
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
