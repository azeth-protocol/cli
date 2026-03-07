import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { resolveOptions, createKit, type CliOptions } from '../../src/utils/config.js';

// Mock AzethKit.create so we never touch the network
vi.mock('@azeth/sdk', () => ({
  AzethKit: {
    create: vi.fn().mockResolvedValue({
      address: '0xMOCK' as `0x${string}`,
      destroy: vi.fn(),
    }),
  },
}));

// Prevent dotenv from loading .env files during tests
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

// Mock key-persistence so tests don't read the real ~/.azeth/key
vi.mock('../../src/utils/key-persistence.js', () => ({
  loadKey: vi.fn().mockReturnValue(null),
  saveKey: vi.fn().mockReturnValue(true),
}));

/** Build a Commander tree that mirrors the real CLI's global options
 *  so that optsWithGlobals() works correctly in resolveOptions().
 *
 *  When `omitChainDefault` is true, the --chain option has no Commander default,
 *  which lets the env-var fallback path in resolveOptions() activate. */
function buildProgram(
  globalArgs: string[] = [],
  subArgs: string[] = [],
  options?: { omitChainDefault?: boolean },
): Command {
  const program = new Command()
    .option('--private-key <key>', 'Private key')
    .option('--rpc-url <url>', 'RPC URL')
    .option('--server-url <url>', 'Server URL');

  if (options?.omitChainDefault) {
    program.option('--chain <chain>', 'Chain to use');
  } else {
    program.option('--chain <chain>', 'Chain to use', 'baseSepolia');
  }

  const sub = new Command('test-sub').action(() => {});
  program.addCommand(sub);

  program.parse([...globalArgs, 'test-sub', ...subArgs], { from: 'user' });
  return sub;
}

describe('resolveOptions', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Snapshot env vars we might mutate
    for (const key of ['AZETH_CHAIN', 'AZETH_PRIVATE_KEY', 'AZETH_RPC_URL_BASE_SEPOLIA', 'AZETH_SERVER_URL']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  it('defaults chain to baseSepolia when nothing is provided', () => {
    const sub = buildProgram();
    const opts = resolveOptions(sub);

    expect(opts.chain).toBe('baseSepolia');
    expect(opts.privateKey).toBeUndefined();
    expect(opts.rpcUrl).toBeUndefined();
    expect(opts.serverUrl).toBeUndefined();
  });

  it('uses env var for chain when Commander has no default', () => {
    // When the --chain option has no Commander default, opts.chain is undefined
    // so the ?? fallback to process.env['AZETH_CHAIN'] activates
    process.env['AZETH_CHAIN'] = 'base';
    const sub = buildProgram([], [], { omitChainDefault: true });
    const opts = resolveOptions(sub);

    expect(opts.chain).toBe('base');
  });

  it('Commander default shadows env var for chain (known behavior)', () => {
    // With Commander's default='baseSepolia', opts.chain is always 'baseSepolia'
    // so the env var is never reached via ??
    process.env['AZETH_CHAIN'] = 'base';
    const sub = buildProgram();
    const opts = resolveOptions(sub);

    // Commander default wins over env var
    expect(opts.chain).toBe('baseSepolia');
  });

  it('flag overrides Commander default for chain', () => {
    const sub = buildProgram(['--chain', 'base']);
    const opts = resolveOptions(sub);

    expect(opts.chain).toBe('base');
  });

  it('does not include privateKey in resolved options (read from env at createKit time)', () => {
    process.env['AZETH_PRIVATE_KEY'] = '0xABC';
    const sub = buildProgram();
    const opts = resolveOptions(sub);

    // privateKey is no longer part of CliOptions — it's read from env in createKit()
    expect((opts as Record<string, unknown>)['privateKey']).toBeUndefined();
  });

  it('resolveOptions ignores --private-key flag (security: keys read from env only)', () => {
    process.env['AZETH_PRIVATE_KEY'] = '0xENV';
    const sub = buildProgram(['--private-key', '0xFLAG']);
    const opts = resolveOptions(sub);

    // CliOptions no longer includes privateKey; env var is used directly in createKit()
    expect((opts as Record<string, unknown>)['privateKey']).toBeUndefined();
  });

  it('reads rpc URL from per-chain env var', () => {
    process.env['AZETH_RPC_URL_BASE_SEPOLIA'] = 'https://custom-rpc.example.com';
    const sub = buildProgram();
    const opts = resolveOptions(sub);

    expect(opts.rpcUrl).toBe('https://custom-rpc.example.com');
  });

  it('reads server URL from env var', () => {
    process.env['AZETH_SERVER_URL'] = 'https://custom-server.example.com';
    const sub = buildProgram();
    const opts = resolveOptions(sub);

    expect(opts.serverUrl).toBe('https://custom-server.example.com');
  });

  it('resolves all values from flags (except privateKey which is env-only)', () => {
    const sub = buildProgram([
      '--chain', 'base',
      '--rpc-url', 'https://rpc.test',
      '--server-url', 'https://server.test',
    ]);
    const opts = resolveOptions(sub);

    expect(opts).toEqual({
      chain: 'base',
      rpcUrl: 'https://rpc.test',
      serverUrl: 'https://server.test',
    });
  });

  it('falls back to baseSepolia when neither flag nor env provides chain', () => {
    const sub = buildProgram([], [], { omitChainDefault: true });
    const opts = resolveOptions(sub);

    expect(opts.chain).toBe('baseSepolia');
  });
});

describe('createKit', () => {
  const savedKey = process.env['AZETH_PRIVATE_KEY'];

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env['AZETH_PRIVATE_KEY'];
    } else {
      process.env['AZETH_PRIVATE_KEY'] = savedKey;
    }
  });

  it('throws when AZETH_PRIVATE_KEY env var is not set', async () => {
    delete process.env['AZETH_PRIVATE_KEY'];

    const options: CliOptions = {
      chain: 'baseSepolia',
    };

    await expect(createKit(options)).rejects.toThrow(
      'Private key required.',
    );
  });

  it('calls AzethKit.create with private key from env var', async () => {
    const { AzethKit } = await import('@azeth/sdk');
    process.env['AZETH_PRIVATE_KEY'] = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    const options: CliOptions = {
      chain: 'base',
      rpcUrl: 'https://rpc.example.com',
      serverUrl: 'https://server.example.com',
    };

    const kit = await createKit(options);

    expect(AzethKit.create).toHaveBeenCalledWith(expect.objectContaining({
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      chain: 'base',
      rpcUrl: 'https://rpc.example.com',
      serverUrl: 'https://server.example.com',
    }));

    expect(kit).toBeDefined();
    expect(kit.address).toBe('0xMOCK');
  });

  it('passes undefined for optional fields when not provided', async () => {
    const { AzethKit } = await import('@azeth/sdk');
    process.env['AZETH_PRIVATE_KEY'] = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    const options: CliOptions = {
      chain: 'baseSepolia',
    };

    await createKit(options);

    expect(AzethKit.create).toHaveBeenCalledWith(expect.objectContaining({
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      chain: 'baseSepolia',
      rpcUrl: undefined,
      serverUrl: undefined,
    }));
  });
});
