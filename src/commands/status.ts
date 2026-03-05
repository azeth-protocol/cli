import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveOptions, createKit } from '../utils/config.js';
import { printHeader, printField, printError, formatAddress } from '../utils/display.js';

export const statusCommand = new Command('status')
  .description('Check account balances with USD values')
  .action(async (_opts, cmd: Command) => {
    try {
      const cliOpts = resolveOptions(cmd);

      const spinner = ora('Connecting...').start();
      const kit = await createKit(cliOpts);
      spinner.text = 'Fetching account balances...';

      const allBalances = await kit.getAllBalances();

      spinner.stop();

      printHeader('Azeth Account Status');
      printField('Owner', chalk.cyan(kit.address));
      printField('Chain', cliOpts.chain);

      for (const account of allBalances.accounts) {
        printHeader(`${account.label} (${formatAddress(account.account)})`);
        for (const tb of account.balances) {
          printField(tb.symbol, `${tb.balanceFormatted} ${tb.symbol} (${tb.usdFormatted})`);
        }
        if (account.balances.length > 1) {
          printField('Total', chalk.bold(account.totalUSDFormatted));
        }
      }

      printHeader('Grand Total');
      console.log(`  ${chalk.bold.green(allBalances.grandTotalUSDFormatted)}`);

      console.log();
      await kit.destroy();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
