import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const mockCreateAccount = vi.fn();
const mockGetBalance = vi.fn();
const mockDestroy = vi.fn().mockResolvedValue(undefined);

vi.mock('@azeth/sdk', () => ({
  AzethKit: {
    create: vi.fn().mockResolvedValue({
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' as `0x${string}`,
      createAccount: mockCreateAccount,
      getBalance: mockGetBalance,
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

describe('init command', () => {
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

  it('initializes a participant with balance check + registry', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockCreateAccount.mockResolvedValueOnce({
      account: '0x1111111111111111111111111111111111111111' as `0x${string}`,
      tokenId: 100n,
      txHash: '0xINIT_TX_HASH',
    });

    const { initCommand } = await import('../../src/commands/init.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(initCommand);

    await program.parseAsync(
      ['init', '--name', 'MyAgent', '--description', 'Test agent'],
      { from: 'user' },
    );

    expect(mockCreateAccount).toHaveBeenCalledWith(expect.objectContaining({
      owner: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      registry: expect.objectContaining({
        name: 'MyAgent',
        description: 'Test agent',
        entityType: 'agent',
        capabilities: [],
      }),
    }));
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('passes capabilities and endpoint when provided', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockCreateAccount.mockResolvedValueOnce({
      account: '0x2222222222222222222222222222222222222222' as `0x${string}`,
      tokenId: 200n,
      txHash: '0xINIT2',
    });

    const { initCommand } = await import('../../src/commands/init.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(initCommand);

    await program.parseAsync(
      [
        'init',
        '--name', 'DataService',
        '--description', 'Provides data',
        '--type', 'service',
        '--capabilities', 'market-data,analytics',
        '--endpoint', 'https://data.example.com',
      ],
      { from: 'user' },
    );

    expect(mockCreateAccount).toHaveBeenCalledWith(expect.objectContaining({
      registry: expect.objectContaining({
        entityType: 'service',
        capabilities: ['market-data', 'analytics'],
        endpoint: 'https://data.example.com',
      }),
    }));
  });

  it('exits with error for invalid entity type', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    const { initCommand } = await import('../../src/commands/init.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(initCommand);

    await program.parseAsync(
      ['init', '--name', 'Bad', '--description', 'Bad', '--type', 'invalid'],
      { from: 'user' },
    );

    expect(errorSpy).toHaveBeenCalled();
    const output = (errorSpy.mock.calls[0]![0] as string).replace(/\u001b\[[0-9;]*m/g, '');
    expect(output).toContain('Invalid entity type');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with error when no private key', async () => {
    const { initCommand } = await import('../../src/commands/init.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(initCommand);

    await program.parseAsync(
      ['init', '--name', 'NoKey', '--description', 'Missing key'],
      { from: 'user' },
    );

    expect(errorSpy).toHaveBeenCalled();
    const output = (errorSpy.mock.calls[0]![0] as string).replace(/\u001b\[[0-9;]*m/g, '');
    expect(output).toContain('Private key required');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
