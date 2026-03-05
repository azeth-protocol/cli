import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { privateKeyToAccount } from 'viem/accounts';
import { resolveOptions, createKit } from '../utils/config.js';
import { printHeader, printField, printSuccess, printError } from '../utils/display.js';
import { TOKENS, type EntityType, type Guardrails } from '@azeth/common';

export const initCommand = new Command('init')
  .description('Deploy a new Azeth smart account with guardian guardrails and register on the trust registry')
  .requiredOption('--name <name>', 'Participant name')
  .requiredOption('--description <desc>', 'Participant description')
  .option('--type <type>', 'Entity type (agent|service|infrastructure)', 'agent')
  .option('--capabilities <caps>', 'Comma-separated capabilities')
  .option('--endpoint <url>', 'Service endpoint URL')
  .option('--guardian <address>', 'Guardian address for co-signing over-limit operations')
  .option('--emergency-address <address>', 'Emergency withdrawal destination address')
  .option('--max-tx <usd>', 'Max USD per transaction (default: $100 testnet, $50 mainnet)')
  .option('--daily-limit <usd>', 'Max USD per day (default: $1000 testnet, $500 mainnet)')
  .action(async (_opts, cmd: Command) => {
    try {
      const cliOpts = resolveOptions(cmd);
      const localOpts = cmd.opts<{
        name: string;
        description: string;
        type: string;
        capabilities?: string;
        endpoint?: string;
        guardian?: string;
        emergencyAddress?: string;
        maxTx?: string;
        dailyLimit?: string;
      }>();

      // Validate name/description length
      if (localOpts.name.length > 256) {
        printError('Name must be 256 characters or fewer');
        process.exit(1);
      }
      if (localOpts.description.length > 1024) {
        printError('Description must be 1024 characters or fewer');
        process.exit(1);
      }

      const validTypes = ['agent', 'service', 'infrastructure'] as const;
      if (!validTypes.includes(localOpts.type as EntityType)) {
        printError(`Invalid entity type "${localOpts.type}". Must be one of: ${validTypes.join(', ')}`);
        process.exit(1);
      }

      // Validate endpoint URL
      if (localOpts.endpoint) {
        try {
          const parsed = new URL(localOpts.endpoint);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            printError('Endpoint must use HTTP or HTTPS protocol');
            process.exit(1);
          }
        } catch {
          printError('Invalid endpoint URL format');
          process.exit(1);
        }
      }

      // Validate capabilities
      if (localOpts.capabilities) {
        const caps = localOpts.capabilities.split(',').map(c => c.trim()).filter(Boolean);
        if (caps.length > 50) {
          printError('Maximum 50 capabilities allowed');
          process.exit(1);
        }
        for (const cap of caps) {
          if (cap.length > 128) {
            printError(`Capability "${cap.slice(0, 20)}..." exceeds 128 character limit`);
            process.exit(1);
          }
        }
      }

      // Parse spending limits
      const isTestnet = cliOpts.chain === 'baseSepolia';
      const maxTxUSD = localOpts.maxTx ? parseFloat(localOpts.maxTx) : (isTestnet ? 100 : 50);
      const dailyUSD = localOpts.dailyLimit ? parseFloat(localOpts.dailyLimit) : (isTestnet ? 1000 : 500);

      if (isNaN(maxTxUSD) || maxTxUSD <= 0) {
        printError('--max-tx must be a positive number');
        process.exit(1);
      }
      if (isNaN(dailyUSD) || dailyUSD <= 0) {
        printError('--daily-limit must be a positive number');
        process.exit(1);
      }

      const spinner = ora('Initializing Azeth participant...').start();
      const kit = await createKit(cliOpts);

      // Resolve guardian address: CLI flag > AZETH_GUARDIAN_KEY env > self-guardian (owner)
      let guardianAddress: `0x${string}` = kit.address;
      let guardianSource = 'self (owner EOA)';

      if (localOpts.guardian) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(localOpts.guardian)) {
          spinner.stop();
          printError(`Invalid guardian address: "${localOpts.guardian}"`);
          process.exit(1);
        }
        guardianAddress = localOpts.guardian as `0x${string}`;
        guardianSource = 'CLI flag';
      } else {
        const guardianKey = process.env['AZETH_GUARDIAN_KEY'];
        if (guardianKey && /^0x[0-9a-fA-F]{64}$/.test(guardianKey.trim())) {
          const guardianAccount = privateKeyToAccount(guardianKey.trim() as `0x${string}`);
          guardianAddress = guardianAccount.address;
          guardianSource = 'AZETH_GUARDIAN_KEY';
        }
      }

      // Resolve emergency address: CLI flag > AZETH_EMERGENCY_ADDRESS env > owner EOA
      let emergencyAddress: `0x${string}` = kit.address;
      if (localOpts.emergencyAddress) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(localOpts.emergencyAddress)) {
          spinner.stop();
          printError(`Invalid emergency address: "${localOpts.emergencyAddress}"`);
          process.exit(1);
        }
        emergencyAddress = localOpts.emergencyAddress as `0x${string}`;
      } else {
        const envEmergency = process.env['AZETH_EMERGENCY_ADDRESS'];
        if (envEmergency && /^0x[0-9a-fA-F]{40}$/.test(envEmergency.trim())) {
          emergencyAddress = envEmergency.trim() as `0x${string}`;
        }
      }

      // Build guardrails (guardian limits are 5x standard limits)
      const guardrails: Guardrails = {
        maxTxAmountUSD: BigInt(Math.round(maxTxUSD)) * 10n ** 18n,
        dailySpendLimitUSD: BigInt(Math.round(dailyUSD)) * 10n ** 18n,
        guardianMaxTxAmountUSD: BigInt(Math.round(maxTxUSD * 5)) * 10n ** 18n,
        guardianDailySpendLimitUSD: BigInt(Math.round(dailyUSD * 5)) * 10n ** 18n,
        guardian: guardianAddress,
        emergencyWithdrawTo: emergencyAddress,
      };

      // Default token whitelist: ETH + USDC + WETH
      const defaultTokens: `0x${string}`[] = [
        '0x0000000000000000000000000000000000000000',
        TOKENS[cliOpts.chain].USDC,
        TOKENS[cliOpts.chain].WETH,
      ];

      // Deploy smart account + register on trust registry
      spinner.text = `Deploying smart account on ${cliOpts.chain}...`;
      const result = await kit.createAccount({
        owner: kit.address,
        guardrails,
        tokens: defaultTokens,
        registry: {
          name: localOpts.name,
          description: localOpts.description,
          entityType: localOpts.type as EntityType,
          capabilities: localOpts.capabilities
            ? localOpts.capabilities.split(',').map((c) => c.trim())
            : [],
          endpoint: localOpts.endpoint,
        },
      });

      spinner.stop();

      // Display results
      printHeader('Azeth Participant Initialized');
      printField('Name', localOpts.name);
      printField('Type', localOpts.type);
      printField('Smart Account', chalk.cyan(result.account));
      printField('Owner EOA', kit.address);
      printField('Token ID', result.tokenId.toString());
      printField('Chain', cliOpts.chain);
      printField('Tx Hash', chalk.cyan(result.txHash));
      console.log();
      printField('Guardian', `${guardianAddress} (${guardianSource})`);
      printField('Emergency To', emergencyAddress);
      printField('Max Tx', `$${maxTxUSD} (guardian: $${maxTxUSD * 5})`);
      printField('Daily Limit', `$${dailyUSD} (guardian: $${dailyUSD * 5})`);

      if (guardianAddress === kit.address) {
        console.log();
        console.log(chalk.yellow('  Warning: Guardian is set to your own address (self-guardian).'));
        console.log(chalk.yellow('    For production, set AZETH_GUARDIAN_KEY or use --guardian <address>.'));
      }

      console.log();
      printSuccess('Smart account deployed and registered on the trust registry.');
      console.log();
      console.log(chalk.gray('  Next steps:'));
      console.log(chalk.gray('    azeth status       — Check account status'));
      console.log(chalk.gray('    azeth discover     — Find other services'));
      console.log(chalk.gray('    azeth pay <url>    — Pay for an x402 service'));
      console.log();

      await kit.destroy();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
