import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveOptions, createKit } from '../utils/config.js';
import { printHeader, printField, printSuccess, printError } from '../utils/display.js';

const agreementsCommand = new Command('agreements')
  .description('Manage recurring payment agreements');

agreementsCommand
  .command('create')
  .description('Create a new recurring payment agreement')
  .requiredOption('--payee <address>', 'Payment recipient address')
  .requiredOption('--token <address>', 'Payment token address (e.g., USDC)')
  .requiredOption('--amount <amount>', 'Payment amount per interval (in token smallest unit)')
  .requiredOption('--interval <seconds>', 'Payment interval in seconds (min 3600)')
  .option('--max-executions <n>', 'Maximum number of payments (0 = unlimited)', '0')
  .action(async (_opts, cmd: Command) => {
    try {
      const cliOpts = resolveOptions(cmd);
      const localOpts = cmd.opts<{
        payee: string;
        token: string;
        amount: string;
        interval: string;
        maxExecutions: string;
      }>();

      // Validate inputs
      if (!/^0x[0-9a-fA-F]{40}$/.test(localOpts.payee)) {
        printError('Invalid payee address');
        process.exit(1);
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(localOpts.token)) {
        printError('Invalid token address');
        process.exit(1);
      }
      if (!/^\d+$/.test(localOpts.amount) || localOpts.amount === '0') {
        printError('Amount must be a positive integer greater than 0');
        process.exit(1);
      }
      const interval = parseInt(localOpts.interval, 10);
      if (isNaN(interval) || interval < 3600) {
        printError('Interval must be at least 3600 seconds (1 hour)');
        process.exit(1);
      }

      const spinner = ora('Creating payment agreement...').start();
      const kit = await createKit(cliOpts);

      const result = await kit.createPaymentAgreement({
        payee: localOpts.payee as `0x${string}`,
        token: localOpts.token as `0x${string}`,
        amount: BigInt(localOpts.amount),
        interval,
        maxExecutions: parseInt(localOpts.maxExecutions, 10) || undefined,
      });

      spinner.stop();

      printHeader('Payment Agreement Created');
      printField('Agreement ID', result.agreementId.toString());
      printField('Payee', localOpts.payee);
      printField('Token', localOpts.token);
      printField('Amount', localOpts.amount);
      printField('Interval', `${interval} seconds`);
      printField('Tx Hash', chalk.cyan(result.txHash));
      printSuccess('Recurring payment agreement is active.');

      console.log();
      await kit.destroy();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export { agreementsCommand };
