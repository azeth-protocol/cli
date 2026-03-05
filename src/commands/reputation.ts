import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveOptions, createKit } from '../utils/config.js';
import { printHeader, printField, printSuccess, printError } from '../utils/display.js';

const reputationCommand = new Command('reputation')
  .description('Query and manage on-chain reputation (payment-weighted)');

reputationCommand
  .command('show')
  .description('Show payment-weighted reputation for an agent')
  .argument('<agentId>', 'ERC-8004 token ID of the agent')
  .action(async (agentIdStr: string, _opts, cmd: Command) => {
    try {
      if (!/^\d+$/.test(agentIdStr)) {
        printError('Agent ID must be a positive integer');
        process.exit(1);
      }

      const agentId = BigInt(agentIdStr);
      const MAX_UINT256 = (1n << 256n) - 1n;
      if (agentId > MAX_UINT256 || agentId === 0n) {
        printError('Agent ID must be between 1 and 2^256-1');
        process.exit(1);
      }

      const cliOpts = resolveOptions(cmd);

      const spinner = ora('Fetching weighted reputation...').start();
      const kit = await createKit(cliOpts);

      const rep = await kit.getWeightedReputation(agentId);

      spinner.stop();

      printHeader(`Reputation for Agent #${agentIdStr}`);
      printField('Opinion Count', rep.opinionCount.toString());

      if (rep.opinionCount > 0n) {
        const score = Number(rep.weightedValue);
        const coloredScore = score >= 80
          ? chalk.green(`${score}`)
          : score >= 50
            ? chalk.yellow(`${score}`)
            : chalk.red(`${score}`);
        printField('Weighted Score', coloredScore);
        printField('Total Weight', rep.totalWeight.toString());
      } else {
        console.log(chalk.yellow('  No opinions yet.'));
      }

      console.log();
      await kit.destroy();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

reputationCommand
  .command('give')
  .description('Submit reputation opinion for an agent (requires prior payment)')
  .argument('<agentId>', 'ERC-8004 token ID of the agent')
  .argument('<rating>', 'Rating from -100 to 100 (supports decimals like 85.5)')
  .option('--tag <tag>', 'Opinion tag (e.g., quality, uptime)', 'quality')
  .option('--endpoint <url>', 'Service endpoint being rated')
  .action(async (agentIdStr: string, ratingStr: string, _opts, cmd: Command) => {
    try {
      if (!/^\d+$/.test(agentIdStr)) {
        printError('Agent ID must be a positive integer');
        process.exit(1);
      }
      {
        const agentIdCheck = BigInt(agentIdStr);
        const MAX_UINT256 = (1n << 256n) - 1n;
        if (agentIdCheck > MAX_UINT256 || agentIdCheck === 0n) {
          printError('Agent ID must be between 1 and 2^256-1');
          process.exit(1);
        }
      }

      const rating = parseFloat(ratingStr);
      if (isNaN(rating)) {
        printError('Rating must be a valid number');
        process.exit(1);
      }
      if (rating < -100 || rating > 100) {
        printError('Rating must be between -100 and 100');
        process.exit(1);
      }

      const cliOpts = resolveOptions(cmd);
      const localOpts = cmd.opts<{ tag: string; endpoint?: string }>();

      // Validate tag: alphanumeric + hyphens, max 64 chars
      if (localOpts.tag.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(localOpts.tag)) {
        printError('Tag must be 1-64 characters, alphanumeric with hyphens and underscores only');
        process.exit(1);
      }

      // Convert rating to WAD (18-decimal) for on-chain storage
      const wadValue = BigInt(Math.round(rating * 1e18));

      const spinner = ora('Submitting opinion...').start();
      const kit = await createKit(cliOpts);

      const txHash = await kit.submitOpinion({
        agentId: BigInt(agentIdStr),
        value: wadValue,
        valueDecimals: 18,  // Always WAD
        tag1: localOpts.tag,
        tag2: 'cli',
        endpoint: localOpts.endpoint ?? '',
        opinionURI: '',
        opinionHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      spinner.stop();

      printHeader('Opinion Submitted');
      printField('Agent ID', agentIdStr);
      printField('Rating', `${rating} (scale: -100 to 100)`);
      printField('Tag', localOpts.tag);
      printField('Tx Hash', chalk.cyan(txHash));
      printSuccess('On-chain reputation opinion recorded (payment-gated).');

      console.log();
      await kit.destroy();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export { reputationCommand };
