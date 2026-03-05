import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const mockCreatePaymentAgreement = vi.fn();
const mockDestroy = vi.fn().mockResolvedValue(undefined);

vi.mock('@azeth/sdk', () => ({
  AzethKit: {
    create: vi.fn().mockResolvedValue({
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' as `0x${string}`,
      createPaymentAgreement: mockCreatePaymentAgreement,
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

describe('agreements command', () => {
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

  it('creates a payment agreement', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockCreatePaymentAgreement.mockResolvedValueOnce({
      agreementId: 1n,
      txHash: '0xAGREEMENT_TX',
    });

    const { agreementsCommand } = await import('../../src/commands/agreements.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(agreementsCommand);

    await program.parseAsync(
      [
        'agreements', 'create',
        '--payee', '0x2222222222222222222222222222222222222222',
        '--token', '0x3333333333333333333333333333333333333333',
        '--amount', '1000000',
        '--interval', '86400',
      ],
      { from: 'user' },
    );

    expect(mockCreatePaymentAgreement).toHaveBeenCalledWith({
      payee: '0x2222222222222222222222222222222222222222',
      token: '0x3333333333333333333333333333333333333333',
      amount: 1000000n,
      interval: 86400,
      maxExecutions: undefined,
    });
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('exits with error for invalid payee address', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    const { agreementsCommand } = await import('../../src/commands/agreements.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(agreementsCommand);

    await program.parseAsync(
      [
        'agreements', 'create',
        '--payee', 'invalid',
        '--token', '0x3333333333333333333333333333333333333333',
        '--amount', '1000000',
        '--interval', '86400',
      ],
      { from: 'user' },
    );

    expect(errorSpy).toHaveBeenCalled();
    const output = (errorSpy.mock.calls[0]![0] as string).replace(/\u001b\[[0-9;]*m/g, '');
    expect(output).toContain('Invalid payee address');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with error for interval below minimum', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    const { agreementsCommand } = await import('../../src/commands/agreements.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(agreementsCommand);

    await program.parseAsync(
      [
        'agreements', 'create',
        '--payee', '0x2222222222222222222222222222222222222222',
        '--token', '0x3333333333333333333333333333333333333333',
        '--amount', '1000000',
        '--interval', '60',
      ],
      { from: 'user' },
    );

    expect(errorSpy).toHaveBeenCalled();
    const output = (errorSpy.mock.calls[0]![0] as string).replace(/\u001b\[[0-9;]*m/g, '');
    expect(output).toContain('at least 3600');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
