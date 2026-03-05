import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Mock AzethKit before importing the command module
const mockPublishService = vi.fn();
const mockDestroy = vi.fn();

vi.mock('@azeth/sdk', () => ({
  AzethKit: {
    create: vi.fn().mockResolvedValue({
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' as `0x${string}`,
      publishService: mockPublishService,
      destroy: mockDestroy,
    }),
  },
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

// Mock ora to avoid spinner output in tests
vi.mock('ora', () => ({
  default: vi.fn().mockReturnValue({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    text: '',
  }),
}));

describe('register command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module cache so each test gets a fresh registerCommand instance
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // Clean env
    delete process.env['AZETH_PRIVATE_KEY'];
    delete process.env['AZETH_CHAIN'];
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('registers a participant successfully with required args', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockPublishService.mockResolvedValueOnce({
      tokenId: 42n,
      txHash: '0xTXHASH123',
    });

    // Import fresh to get the mocked version
    const { registerCommand } = await import('../../src/commands/register.js');

    // Build a parent program that provides global options
    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--private-key <key>', 'Private key')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(registerCommand);

    await program.parseAsync(
      ['register', '--name', 'TestAgent', '--description', 'A test agent'],
      { from: 'user' },
    );

    expect(mockPublishService).toHaveBeenCalledWith({
      name: 'TestAgent',
      description: 'A test agent',
      entityType: 'agent',
      capabilities: [],
      endpoint: undefined,
    });
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('passes capabilities and endpoint when provided', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    mockPublishService.mockResolvedValueOnce({
      tokenId: 7n,
      txHash: '0xHASH',
    });

    const { registerCommand } = await import('../../src/commands/register.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--private-key <key>', 'Private key')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(registerCommand);

    await program.parseAsync(
      [
        'register',
        '--name', 'MyService',
        '--description', 'Test service',
        '--type', 'service',
        '--capabilities', 'swap,bridge,lending',
        '--endpoint', 'https://api.example.com',
      ],
      { from: 'user' },
    );

    expect(mockPublishService).toHaveBeenCalledWith({
      name: 'MyService',
      description: 'Test service',
      entityType: 'service',
      capabilities: ['swap', 'bridge', 'lending'],
      endpoint: 'https://api.example.com',
    });
  });

  it('exits with error for invalid entity type', async () => {
    process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    const { registerCommand } = await import('../../src/commands/register.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--private-key <key>', 'Private key')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(registerCommand);

    await program.parseAsync(
      ['register', '--name', 'Bad', '--description', 'Bad type', '--type', 'unknown'],
      { from: 'user' },
    );

    // Should have printed an error and called process.exit(1)
    expect(errorSpy).toHaveBeenCalled();
    const errorOutput = errorSpy.mock.calls[0]![0] as string;
    const stripped = errorOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('Invalid entity type');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with error when createKit fails (no private key)', async () => {
    // No private key set anywhere

    const { registerCommand } = await import('../../src/commands/register.js');

    const program = new Command()
      .option('--chain <chain>', 'Chain', 'baseSepolia')
      .option('--private-key <key>', 'Private key')
      .option('--rpc-url <url>', 'RPC URL')
      .option('--server-url <url>', 'Server URL');

    program.addCommand(registerCommand);

    await program.parseAsync(
      ['register', '--name', 'NoKey', '--description', 'Missing key'],
      { from: 'user' },
    );

    expect(errorSpy).toHaveBeenCalled();
    const errorOutput = errorSpy.mock.calls[0]![0] as string;
    const stripped = errorOutput.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('Private key required');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
