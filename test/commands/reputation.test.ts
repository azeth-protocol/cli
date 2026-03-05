import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const mockGetWeightedReputation = vi.fn();
const mockSubmitOpinion = vi.fn();
const mockDestroy = vi.fn().mockResolvedValue(undefined);

vi.mock('@azeth/sdk', () => ({
  AzethKit: {
    create: vi.fn().mockResolvedValue({
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' as `0x${string}`,
      getWeightedReputation: mockGetWeightedReputation,
      submitOpinion: mockSubmitOpinion,
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

describe('reputation command', () => {
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

  describe('reputation show', () => {
    it('displays weighted reputation for an agent', async () => {
      process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      mockGetWeightedReputation.mockResolvedValueOnce({
        weightedValue: 85n,
        totalWeight: 1000000n,
        opinionCount: 10n,
      });

      const { reputationCommand } = await import('../../src/commands/reputation.js');

      const program = new Command()
        .option('--chain <chain>', 'Chain', 'baseSepolia')
        .option('--rpc-url <url>', 'RPC URL')
        .option('--server-url <url>', 'Server URL');

      program.addCommand(reputationCommand);

      await program.parseAsync(
        ['reputation', 'show', '42'],
        { from: 'user' },
      );

      expect(mockGetWeightedReputation).toHaveBeenCalledWith(42n);
      const allOutput = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      const stripped = allOutput.replace(/\u001b\[[0-9;]*m/g, '');
      expect(stripped).toContain('Agent #42');
      expect(stripped).toContain('10');
    });

    it('shows no opinions message for zero count', async () => {
      process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      mockGetWeightedReputation.mockResolvedValueOnce({
        weightedValue: 0n,
        totalWeight: 0n,
        opinionCount: 0n,
      });

      const { reputationCommand } = await import('../../src/commands/reputation.js');

      const program = new Command()
        .option('--chain <chain>', 'Chain', 'baseSepolia')
        .option('--rpc-url <url>', 'RPC URL')
        .option('--server-url <url>', 'Server URL');

      program.addCommand(reputationCommand);

      await program.parseAsync(
        ['reputation', 'show', '99'],
        { from: 'user' },
      );

      const allOutput = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      const stripped = allOutput.replace(/\u001b\[[0-9;]*m/g, '');
      expect(stripped).toContain('No opinions yet');
    });
  });

  describe('reputation give', () => {
    it('submits opinion with WAD-encoded rating', async () => {
      process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      mockSubmitOpinion.mockResolvedValueOnce('0xOPINION_TX');

      const { reputationCommand } = await import('../../src/commands/reputation.js');

      const program = new Command()
        .option('--chain <chain>', 'Chain', 'baseSepolia')
        .option('--rpc-url <url>', 'RPC URL')
        .option('--server-url <url>', 'Server URL');

      program.addCommand(reputationCommand);

      await program.parseAsync(
        ['reputation', 'give', '42', '90', '--tag', 'uptime'],
        { from: 'user' },
      );

      // rating=90 → WAD value = 90 * 1e18 = 90000000000000000000n
      expect(mockSubmitOpinion).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 42n,
        value: 90000000000000000000n,
        valueDecimals: 18,
        tag1: 'uptime',
        tag2: 'cli',
        endpoint: '',
        opinionURI: '',
        opinionHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      }));
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('exits with error for non-numeric rating', async () => {
      process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const { reputationCommand } = await import('../../src/commands/reputation.js');

      const program = new Command()
        .option('--chain <chain>', 'Chain', 'baseSepolia')
        .option('--rpc-url <url>', 'RPC URL')
        .option('--server-url <url>', 'Server URL');

      program.addCommand(reputationCommand);

      await program.parseAsync(
        ['reputation', 'give', '42', 'abc'],
        { from: 'user' },
      );

      expect(errorSpy).toHaveBeenCalled();
      const output = (errorSpy.mock.calls[0]![0] as string).replace(/\u001b\[[0-9;]*m/g, '');
      expect(output).toContain('Rating must be a valid number');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('allows negative ratings with WAD encoding', async () => {
      process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      mockSubmitOpinion.mockResolvedValueOnce('0xNEG_TX');

      const { reputationCommand } = await import('../../src/commands/reputation.js');

      const program = new Command()
        .option('--chain <chain>', 'Chain', 'baseSepolia')
        .option('--rpc-url <url>', 'RPC URL')
        .option('--server-url <url>', 'Server URL');

      program.addCommand(reputationCommand);

      await program.parseAsync(
        ['reputation', 'give', '42', '-50', '--tag', 'quality'],
        { from: 'user' },
      );

      // rating=-50 → WAD value = -50 * 1e18 = -50000000000000000000n
      expect(mockSubmitOpinion).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 42n,
        value: -50000000000000000000n,
        valueDecimals: 18,
        tag1: 'quality',
        tag2: 'cli',
      }));
    });

    it('rejects ratings outside -100 to 100 range', async () => {
      process.env['AZETH_PRIVATE_KEY'] = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const { reputationCommand } = await import('../../src/commands/reputation.js');

      const program = new Command()
        .option('--chain <chain>', 'Chain', 'baseSepolia')
        .option('--rpc-url <url>', 'RPC URL')
        .option('--server-url <url>', 'Server URL');

      program.addCommand(reputationCommand);

      await program.parseAsync(
        ['reputation', 'give', '42', '150'],
        { from: 'user' },
      );

      expect(errorSpy).toHaveBeenCalled();
      const output = (errorSpy.mock.calls[0]![0] as string).replace(/\u001b\[[0-9;]*m/g, '');
      expect(output).toContain('Rating must be between -100 and 100');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
