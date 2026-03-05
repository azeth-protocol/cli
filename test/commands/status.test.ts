import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Mock AzethKit
const mockGetAllBalances = vi.fn();
const mockDestroy = vi.fn();

vi.mock('@azeth/sdk', () => ({
  AzethKit: {
    create: vi.fn().mockResolvedValue({
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' as `0x${string}`,
      getAllBalances: mockGetAllBalances,
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

describe('status command', () => {
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
    delete process.env['AZETH_CHAIN'];
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('displays multi-account balances with USD values', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockGetAllBalances.mockResolvedValueOnce({
      accounts: [
        {
          account: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
          label: 'EOA',
          balances: [
            { token: '0x0000000000000000000000000000000000000000', symbol: 'ETH', balance: 1500000000000000000n, balanceFormatted: '1.5', usdValue: 3600000000000000000000n, usdFormatted: '$3600.00' },
          ],
          totalUSD: 3600000000000000000000n,
          totalUSDFormatted: '$3600.00',
        },
        {
          account: '0xDEF0000000000000000000000000000000000001',
          label: 'Smart Account #1',
          balances: [
            { token: '0x0000000000000000000000000000000000000000', symbol: 'ETH', balance: 500000000000000000n, balanceFormatted: '0.5', usdValue: 1200000000000000000000n, usdFormatted: '$1200.00' },
            { token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', symbol: 'USDC', balance: 100000000n, balanceFormatted: '100.0', usdValue: 100000000000000000000n, usdFormatted: '$100.00' },
          ],
          totalUSD: 1300000000000000000000n,
          totalUSDFormatted: '$1300.00',
        },
      ],
      grandTotalUSD: 4900000000000000000000n,
      grandTotalUSDFormatted: '$4900.00',
    });

    const { statusCommand } = await import('../../src/commands/status.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--private-key <key>', 'Private key')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(statusCommand);

    await program.parseAsync(['status'], { from: 'user' });

    expect(mockGetAllBalances).toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalled();

    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const stripped = allOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('ETH');
    expect(stripped).toContain('1.5');
    expect(stripped).toContain('USDC');
    expect(stripped).toContain('$4900.00');
    expect(stripped).toContain('EOA');
    expect(stripped).toContain('Smart Account #1');
  });

  it('displays single account when no smart accounts', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockGetAllBalances.mockResolvedValueOnce({
      accounts: [
        {
          account: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
          label: 'EOA',
          balances: [
            { token: '0x0000000000000000000000000000000000000000', symbol: 'ETH', balance: 0n, balanceFormatted: '0', usdValue: 0n, usdFormatted: '$0.00' },
          ],
          totalUSD: 0n,
          totalUSDFormatted: '$0.00',
        },
      ],
      grandTotalUSD: 0n,
      grandTotalUSDFormatted: '$0.00',
    });

    const { statusCommand } = await import('../../src/commands/status.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--private-key <key>', 'Private key')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(statusCommand);

    await program.parseAsync(['status'], { from: 'user' });

    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const stripped = allOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('EOA');
    expect(stripped).toContain('$0.00');
  });

  it('exits with error when no private key is available', async () => {
    const { statusCommand } = await import('../../src/commands/status.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--private-key <key>', 'Private key')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(statusCommand);

    await program.parseAsync(['status'], { from: 'user' });

    expect(errorSpy).toHaveBeenCalled();
    const errorOutput = errorSpy.mock.calls[0]![0] as string;
    const stripped = errorOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('Private key required');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockGetAllBalances.mockRejectedValueOnce(new Error('Network timeout'));

    const { statusCommand } = await import('../../src/commands/status.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--private-key <key>', 'Private key')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(statusCommand);

    await program.parseAsync(['status'], { from: 'user' });

    expect(errorSpy).toHaveBeenCalled();
    const errorOutput = errorSpy.mock.calls[0]![0] as string;
    const stripped = errorOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('Network timeout');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
