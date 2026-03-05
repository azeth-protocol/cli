import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const mockFetch402 = vi.fn();
const mockDestroy = vi.fn().mockResolvedValue(undefined);

vi.mock('@azeth/sdk', () => ({
  AzethKit: {
    create: vi.fn().mockResolvedValue({
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' as `0x${string}`,
      fetch402: mockFetch402,
      destroy: mockDestroy,
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

describe('call command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

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
  });

  it('calls a service and displays result', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockFetch402.mockResolvedValueOnce({
      response: {
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue('{"result": "ok"}'),
      },
      paymentMade: true,
      amount: 500000n,
    });

    const { callCommand } = await import('../../src/commands/call.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(callCommand);

    await program.parseAsync(
      ['call', 'https://api.example.com/data'],
      { from: 'user' },
    );

    expect(mockFetch402).toHaveBeenCalledWith('https://api.example.com/data', expect.objectContaining({
      method: 'GET',
    }));
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('handles non-payment response (no 402)', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockFetch402.mockResolvedValueOnce({
      response: {
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: vi.fn().mockResolvedValue('Hello World'),
      },
      paymentMade: false,
    });

    const { callCommand } = await import('../../src/commands/call.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(callCommand);

    await program.parseAsync(
      ['call', 'https://free.example.com/api'],
      { from: 'user' },
    );

    expect(mockFetch402).toHaveBeenCalled();
  });

  it('passes method and body options', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockFetch402.mockResolvedValueOnce({
      response: {
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue('{}'),
      },
      paymentMade: false,
    });

    const { callCommand } = await import('../../src/commands/call.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(callCommand);

    await program.parseAsync(
      ['call', 'https://api.example.com/submit', '--method', 'POST', '--body', '{"key":"value"}'],
      { from: 'user' },
    );

    expect(mockFetch402).toHaveBeenCalledWith('https://api.example.com/submit', expect.objectContaining({
      method: 'POST',
      body: '{"key":"value"}',
    }));
  });

  it('exits with error when no private key', async () => {
    const { callCommand } = await import('../../src/commands/call.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(callCommand);

    await program.parseAsync(
      ['call', 'https://api.example.com/data'],
      { from: 'user' },
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
