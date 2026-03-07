import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

vi.mock('ora', () => ({
  default: vi.fn().mockReturnValue({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    text: '',
  }),
}));

describe('discover command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    originalFetch = globalThis.fetch;

    delete process.env['AZETH_SERVER_URL'];
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  function createProgram(cmd: Command): Command {
    return new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--private-key <key>', 'Private key')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL')
      .addCommand(cmd);
  }

  // First dynamic import after vi.resetModules() cold-loads @azeth/common (large ABIs)
  it('displays results in a table when services are found', { timeout: 15000 }, async () => {
    const responseData = {
      data: [
        { tokenId: '1', owner: '0x1111111111111111111111111111111111111111', entityType: 'service', name: 'PriceFeed', capabilities: ['price-feed'], active: true },
        { tokenId: '2', owner: '0x2222222222222222222222222222222222222222', entityType: 'agent', name: 'SwapBot', capabilities: ['swap'], active: true },
      ],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue(responseData),
      text: vi.fn().mockResolvedValue(JSON.stringify(responseData)),
    });

    const { discoverCommand } = await import('../../src/commands/discover.js');
    const program = createProgram(discoverCommand);

    await program.parseAsync(['discover', '--capability', 'price-feed'], { from: 'user' });

    const allOutput = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    const stripped = allOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('PriceFeed');
    expect(stripped).toContain('SwapBot');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('shows no services message when results are empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ data: [] }),
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: [] })),
    });

    const { discoverCommand } = await import('../../src/commands/discover.js');
    const program = createProgram(discoverCommand);

    await program.parseAsync(['discover'], { from: 'user' });

    const allOutput = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    const stripped = allOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('No services found');
  });

  it('exits with error on API failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { discoverCommand } = await import('../../src/commands/discover.js');
    const program = createProgram(discoverCommand);

    await program.parseAsync(['discover'], { from: 'user' });

    expect(errorSpy).toHaveBeenCalled();
    const errorOutput = errorSpy.mock.calls[0]![0] as string;
    const stripped = errorOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('500');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('passes query parameters correctly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ data: [] }),
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: [] })),
    });

    const { discoverCommand } = await import('../../src/commands/discover.js');
    const program = createProgram(discoverCommand);

    await program.parseAsync(
      ['discover', '--capability', 'swap', '--type', 'service', '--limit', '25'],
      { from: 'user' },
    );

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const url = new URL(fetchCall);
    expect(url.searchParams.get('capability')).toBe('swap');
    expect(url.searchParams.get('entityType')).toBe('service');
    expect(url.searchParams.get('limit')).toBe('25');
  });

  it('uses server-url option when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ data: [] }),
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: [] })),
    });

    const { discoverCommand } = await import('../../src/commands/discover.js');
    const program = createProgram(discoverCommand);

    await program.parseAsync(
      ['discover', '--server-url', 'https://custom.example.com'],
      { from: 'user' },
    );

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(fetchCall).toContain('https://custom.example.com');
  });
});
