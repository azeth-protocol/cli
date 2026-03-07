import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { AzethKit, type AzethKitConfig } from '@azeth/sdk';
import { isValidChainName, TOKENS, type Guardrails, type SupportedChainName } from '@azeth/common';
import { printHeader, printField, printSuccess, printError } from '../utils/display.js';

const DEFAULT_SERVER_URL = 'https://api.azeth.ai';

/** Print a prominent warning box about the throwaway demo key */
function printKeyWarning(privateKey: string, eoaAddress: string): void {
  const lines = [
    'WARNING: DEMO KEY — NOT FOR PRODUCTION',
    '',
    'A throwaway private key has been generated for this demo.',
    `Private Key: ${privateKey}`,
    `EOA Address: ${eoaAddress}`,
    '',
    'To keep this account, save the key above.',
    'To use your own key: export AZETH_PRIVATE_KEY=0x...',
  ];

  // Compute box width based on longest content line + padding
  const maxLen = Math.max(...lines.map((l) => l.length));
  const innerWidth = maxLen + 4; // 2 chars padding each side

  const top = chalk.yellow.bold('╔' + '═'.repeat(innerWidth) + '╗');
  const bottom = chalk.yellow.bold('╚' + '═'.repeat(innerWidth) + '╝');

  console.log();
  console.log(top);
  for (const line of lines) {
    const padded = '  ' + line + ' '.repeat(innerWidth - line.length - 2);
    console.log(chalk.yellow.bold('║') + chalk.yellow(padded) + chalk.yellow.bold('║'));
  }
  console.log(bottom);
  console.log();
}

export const quickstartCommand = new Command('quickstart')
  .description('Deploy a smart account in one command — no config, no ETH required')
  .option('--name <name>', 'Agent name (auto-generated if omitted)')
  .action(async (_opts, cmd: Command) => {
    let kit: AzethKit | undefined;
    try {
      // Resolve chain from global --chain option
      const chainRaw = cmd.optsWithGlobals<{ chain?: string }>().chain ?? 'baseSepolia';
      if (!isValidChainName(chainRaw)) {
        printError(`Invalid chain "${chainRaw}". Must be one of: base, baseSepolia, ethereumSepolia, ethereum`);
        process.exit(1);
      }
      const chain: SupportedChainName = chainRaw;

      // Step 1: Resolve private key — use existing env var or generate a throwaway key
      let privateKey: `0x${string}`;
      let generated = false;

      const envKey = process.env['AZETH_PRIVATE_KEY'];
      if (envKey && /^0x[0-9a-fA-F]{64}$/.test(envKey.trim())) {
        privateKey = envKey.trim() as `0x${string}`;
      } else {
        privateKey = generatePrivateKey();
        generated = true;
      }

      const account = privateKeyToAccount(privateKey);
      const eoaAddress = account.address;

      // Step 2: Show the warning box if key was generated
      if (generated) {
        printKeyWarning(privateKey, eoaAddress);
      }

      // Step 3: Resolve name
      const localOpts = cmd.opts<{ name?: string }>();
      const shortHex = eoaAddress.slice(-4);
      const name = localOpts.name ?? `Agent-${shortHex}`;

      if (name.length > 256) {
        printError('Name must be 256 characters or fewer');
        process.exit(1);
      }

      // Step 4: Build AzethKitConfig directly (no env vars required)
      const config: AzethKitConfig = {
        privateKey,
        chain,
        serverUrl: process.env['AZETH_SERVER_URL'] ?? DEFAULT_SERVER_URL,
      };

      const spinner = ora(`Deploying smart account on ${chain} (gas sponsored by Azeth)...`).start();
      kit = await AzethKit.create(config);

      // Step 5: Deploy smart account + register on ERC-8004
      const isTestnet = chain === 'baseSepolia' || chain === 'ethereumSepolia';
      const maxTxUSD = isTestnet ? 100 : 50;
      const dailyUSD = isTestnet ? 1000 : 500;

      const guardrails: Guardrails = {
        maxTxAmountUSD: BigInt(maxTxUSD) * 10n ** 18n,
        dailySpendLimitUSD: BigInt(dailyUSD) * 10n ** 18n,
        guardianMaxTxAmountUSD: BigInt(maxTxUSD * 5) * 10n ** 18n,
        guardianDailySpendLimitUSD: BigInt(dailyUSD * 5) * 10n ** 18n,
        guardian: eoaAddress,
        emergencyWithdrawTo: eoaAddress,
      };

      const defaultTokens: `0x${string}`[] = [
        '0x0000000000000000000000000000000000000000',
        TOKENS[chain].USDC,
        TOKENS[chain].WETH,
      ];

      const result = await kit.createAccount({
        owner: eoaAddress,
        guardrails,
        tokens: defaultTokens,
        registry: {
          name,
          description: 'Azeth quickstart agent',
          entityType: 'agent',
          capabilities: ['general'],
        },
      });

      spinner.stop();

      // Step 6: Print results
      const serverUrl = config.serverUrl ?? DEFAULT_SERVER_URL;
      const tokenIdStr = result.tokenId.toString();
      const badgeUrl = `${serverUrl}/badge/${tokenIdStr}`;
      const profileUrl = `https://azeth.ai/agent/${result.account}`;

      printHeader('Azeth Quickstart Complete');
      printField('Name', name);
      printField('Smart Account', chalk.cyan(result.account));
      printField('Token ID', tokenIdStr);
      printField('Chain', chain);
      printField('Tx Hash', chalk.cyan(result.txHash));
      console.log();
      printField('Profile', profileUrl);
      printField('Badge', badgeUrl);
      console.log();
      printSuccess('Gas sponsored by Azeth testnet — no ETH required.');
      console.log();

      // Step 6b: Fund the smart account with testnet USDC via faucet (testnet only)
      if (isTestnet) {
        try {
          const faucetSpinner = ora('Funding account with testnet USDC...').start();
          const faucetRes = await fetch(`${serverUrl}/api/v1/faucet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: result.account }),
            signal: AbortSignal.timeout(60_000),
          });
          if (faucetRes.ok) {
            const faucetBody = await faucetRes.json() as { data?: { amount?: string; txHash?: string } };
            faucetSpinner.stop();
            printSuccess(`Funded with ${faucetBody.data?.amount ?? '1.00 USDC'} for demo calls.`);
            console.log();
          } else {
            faucetSpinner.stop();
            // Non-fatal: show manual funding instructions
            console.log(chalk.gray('  Faucet unavailable — send testnet USDC to your smart account to try paid services.'));
            console.log();
          }
        } catch {
          // Non-fatal — faucet unreachable
          console.log(chalk.gray('  Could not reach faucet — send testnet USDC to your smart account to try paid services.'));
          console.log();
        }
      }

      // Step 6c: Demo the live ecosystem — call the free catalog
      const catalogUrl = `${serverUrl}/api/v1/pricing`;
      try {
        const catalogSpinner = ora('Discovering live services...').start();
        const catalogRes = await fetch(catalogUrl, { signal: AbortSignal.timeout(5000) });
        if (catalogRes.ok) {
          const catalogBody = await catalogRes.json() as {
            data?: { name?: string; catalog?: Array<{ name?: string; pricing?: string; description?: string }> };
          };
          const catalog = catalogBody.data?.catalog;
          catalogSpinner.stop();
          if (catalog && catalog.length > 0) {
            printHeader('Live Services Available');
            for (const item of catalog) {
              console.log(`  ${chalk.cyan(item.name ?? '?')}  ${chalk.gray(item.pricing ?? '')}  ${chalk.white(item.description ?? '')}`);
            }
            console.log();
            console.log(chalk.gray('  Try a paid call now' + (isTestnet ? ' (your account is funded)' : '') + ':'));
            console.log(chalk.cyan(`    azeth call ${serverUrl}/api/v1/pricing/ethereum`));
            console.log();
          }
        } else {
          catalogSpinner.stop();
        }
      } catch {
        // Non-fatal — catalog fetch failed, just skip the demo
      }

      console.log(chalk.gray('  Next steps:'));
      console.log(chalk.gray('    azeth status                — Check your account'));
      console.log(chalk.gray('    azeth find "price feed"     — Discover services'));
      console.log(chalk.gray(`    azeth call <url>             — Call an x402 service`));
      console.log();

      // Step 7: Print key persistence instructions (only for generated keys)
      if (generated) {
        console.log(chalk.bold('  To continue using this account:'));
        console.log(chalk.cyan(`    export AZETH_PRIVATE_KEY=${privateKey}`));
        console.log();
        console.log(chalk.gray('  Or add to .env:'));
        console.log(chalk.gray(`    echo 'AZETH_PRIVATE_KEY=${privateKey}' >> .env`));
        console.log();
      }
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      try { await kit?.destroy(); } catch { /* cleanup best-effort */ }
    }
  });
