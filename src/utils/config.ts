import { AzethKit, type AzethKitConfig } from '@azeth/sdk';
import { isValidChainName, isValidPrivateKey } from '@azeth/common';
import type { SupportedChainName } from '@azeth/common';
import type { Command } from 'commander';
import dotenv from 'dotenv';

dotenv.config();

export interface CliOptions {
  chain: SupportedChainName;
  rpcUrl?: string;
  serverUrl?: string;
}

/** Resolve CLI options from commander flags + environment variables */
export function resolveOptions(cmd: Command): CliOptions {
  const opts = cmd.optsWithGlobals<{
    chain?: string;
    rpcUrl?: string;
    serverUrl?: string;
  }>();

  const chainRaw = opts.chain ?? process.env['AZETH_CHAIN'] ?? 'baseSepolia';
  if (!isValidChainName(chainRaw)) {
    throw new Error(`Invalid chain "${chainRaw}". Must be one of: base, baseSepolia, ethereumSepolia, ethereum`);
  }

  const rpcUrl = opts.rpcUrl ?? process.env['BASE_RPC_URL'];
  const serverUrl = opts.serverUrl ?? process.env['AZETH_SERVER_URL'];

  // Validate server URL if provided
  if (serverUrl) {
    try {
      const parsed = new URL(serverUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Server URL must use HTTP or HTTPS');
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('must use')) throw e;
      throw new Error(`Invalid server URL: "${serverUrl}"`);
    }
  }

  return { chain: chainRaw, rpcUrl, serverUrl };
}

/** Create an AzethKit instance from resolved CLI options.
 *  Private key is read exclusively from the AZETH_PRIVATE_KEY environment variable.
 *  NEVER pass private keys via command-line arguments (visible in shell history and process listings). */
export async function createKit(options: CliOptions): Promise<AzethKit> {
  const privateKey = process.env['AZETH_PRIVATE_KEY'];
  if (!privateKey) {
    throw new Error(
      'Private key required. Set the AZETH_PRIVATE_KEY environment variable.\n' +
      'Example: export AZETH_PRIVATE_KEY=0x...\n' +
      'WARNING: Never pass private keys via command-line flags — they are visible in shell history.',
    );
  }

  if (!isValidPrivateKey(privateKey)) {
    throw new Error('Invalid AZETH_PRIVATE_KEY format. Must be 0x-prefixed followed by 64 hex characters.');
  }

  const guardianKey = process.env['AZETH_GUARDIAN_KEY'];
  if (guardianKey && !/^0x[0-9a-fA-F]{64}$/.test(guardianKey.trim())) {
    throw new Error('AZETH_GUARDIAN_KEY is malformed. Must be 0x-prefixed followed by 64 hex characters.');
  }

  const guardianAutoSign = process.env['AZETH_GUARDIAN_AUTO_SIGN']?.toLowerCase() === 'true';

  const config: AzethKitConfig = {
    privateKey: privateKey as `0x${string}`,
    chain: options.chain,
    rpcUrl: options.rpcUrl,
    serverUrl: options.serverUrl,
    guardianKey: guardianKey ? guardianKey.trim() as `0x${string}` : undefined,
    guardianAutoSign,
  };

  return AzethKit.create(config);
}
