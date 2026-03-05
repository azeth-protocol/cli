import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const mockFetch402 = vi.fn();
const mockDestroy = vi.fn();

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

describe('pay command', () => {
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

  function createProgram(cmd: Command): Command {
    return new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--private-key <key>', 'Private key')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL')
      .addCommand(cmd);
  }

  it('displays payment result on success', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockFetch402.mockResolvedValueOnce({
      response: {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ result: 'data' }),
        text: vi.fn().mockResolvedValue(JSON.stringify({ result: 'data' })),
      },
      paymentMade: true,
      amount: 1000000n,
    });

    const { payCommand } = await import('../../src/commands/pay.js');
    const program = createProgram(payCommand);

    await program.parseAsync(
      ['pay', 'https://api.example.com/data'],
      { from: 'user' },
    );

    const allOutput = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    const stripped = allOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('x402 Payment Result');
    expect(stripped).toContain('https://api.example.com/data');
    expect(stripped).toContain('USDC');
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('shows non-payment response correctly', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockFetch402.mockResolvedValueOnce({
      response: {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: vi.fn().mockResolvedValue('Hello, World!'),
      },
      paymentMade: false,
    });

    const { payCommand } = await import('../../src/commands/pay.js');
    const program = createProgram(payCommand);

    await program.parseAsync(
      ['pay', 'https://free.example.com'],
      { from: 'user' },
    );

    const allOutput = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    const stripped = allOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('Hello, World!');
  });

  it('exits with error when no private key', async () => {
    const { payCommand } = await import('../../src/commands/pay.js');
    const program = createProgram(payCommand);

    await program.parseAsync(
      ['pay', 'https://api.example.com/data'],
      { from: 'user' },
    );

    expect(errorSpy).toHaveBeenCalled();
    const errorOutput = errorSpy.mock.calls[0]![0] as string;
    const stripped = errorOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('Private key required');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('shows error when service returns non-OK status', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockFetch402.mockResolvedValueOnce({
      response: {
        ok: false,
        status: 500,
        headers: new Headers(),
      },
      paymentMade: true,
      amount: 500000n,
    });

    const { payCommand } = await import('../../src/commands/pay.js');
    const program = createProgram(payCommand);

    await program.parseAsync(
      ['pay', 'https://broken.example.com'],
      { from: 'user' },
    );

    expect(errorSpy).toHaveBeenCalled();
    const errorOutput = errorSpy.mock.calls[0]![0] as string;
    const stripped = errorOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('500');
  });

  it('passes method and body options correctly', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockFetch402.mockResolvedValueOnce({
      response: {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ ok: true }),
        text: vi.fn().mockResolvedValue(JSON.stringify({ ok: true })),
      },
      paymentMade: false,
    });

    const { payCommand } = await import('../../src/commands/pay.js');
    const program = createProgram(payCommand);

    await program.parseAsync(
      ['pay', 'https://api.example.com', '--method', 'POST', '--body', '{"key":"val"}'],
      { from: 'user' },
    );

    expect(mockFetch402).toHaveBeenCalledWith('https://api.example.com', {
      method: 'POST',
      maxAmount: undefined,
      body: '{"key":"val"}',
    });
  });
});
