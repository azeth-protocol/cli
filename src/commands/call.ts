import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveOptions, createKit } from '../utils/config.js';
import { printHeader, printField, printSuccess, printError, stripAnsi } from '../utils/display.js';

export const callCommand = new Command('call')
  .description('Call an x402 service — auto-discover, auto-pay, auto-feedback')
  .argument('<url>', 'URL of the service to call')
  .option('--method <method>', 'HTTP method (GET|POST|PUT|DELETE)', 'GET')
  .option('--body <json>', 'JSON request body')
  .option('--max-amount <amount>', 'Maximum payment in USDC (e.g., "1.00")')
  .option('--no-feedback', 'Disable auto-feedback after call')
  .action(async (url: string, _opts, cmd: Command) => {
    try {
      const cliOpts = resolveOptions(cmd);
      const localOpts = cmd.opts<{
        method: string;
        body?: string;
        maxAmount?: string;
        feedback: boolean;
      }>();

      // Validate URL format
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          printError('URL must use HTTP or HTTPS protocol');
          process.exit(1);
        }
      } catch {
        printError('Invalid URL format');
        process.exit(1);
      }

      // Validate --body is valid JSON
      if (localOpts.body) {
        try {
          JSON.parse(localOpts.body);
        } catch {
          printError('--body must be valid JSON');
          process.exit(1);
        }
      }

      const spinner = ora('Connecting...').start();
      const kit = await createKit(cliOpts);

      spinner.text = `Calling ${url}...`;
      const startTime = Date.now();

      const result = await kit.fetch402(url, {
        method: localOpts.method,
        maxAmount: localOpts.maxAmount ? parseUSDC(localOpts.maxAmount) : undefined,
        body: localOpts.body,
        autoReputation: localOpts.feedback,
      });

      const elapsed = Date.now() - startTime;
      spinner.stop();

      printHeader('Service Call Result');
      printField('URL', url);
      printField('Method', localOpts.method);
      printField('Status', colorStatus(result.response.status));
      printField('Time', `${elapsed}ms`);
      printField('Payment', result.paymentMade ? chalk.green('Yes') : chalk.gray('No'));

      if (result.paymentMade && result.amount !== undefined) {
        const usdcFormatted = (Number(result.amount) / 1_000_000).toFixed(6);
        printField('Amount', `${usdcFormatted} USDC`);
      }

      if (result.response.ok) {
        const MAX_BODY_SIZE = 1_048_576;
        const contentLength = result.response.headers.get('content-length');
        // Audit #10: Handle NaN from invalid Content-Length (NaN > X is always false)
        const parsedLength = contentLength ? Number(contentLength) : 0;
        if (contentLength && (!Number.isFinite(parsedLength) || parsedLength > MAX_BODY_SIZE)) {
          printError('Response body too large (Content-Length exceeds limit)');
          process.exit(1);
        }
        const text = await result.response.text();
        if (text.length > MAX_BODY_SIZE) {
          printError('Response body too large');
          process.exit(1);
        }
        const contentType = result.response.headers.get('content-type') ?? '';
        // M-2: Strip ANSI escape codes from external response to prevent terminal injection
        const safeText = stripAnsi(text);
        if (contentType.includes('application/json')) {
          try {
            const body = JSON.parse(safeText) as unknown;
            const jsonStr = JSON.stringify(body, null, 2);
            printHeader('Response');
            if (jsonStr.length > 2000) {
              console.log(chalk.white(jsonStr.slice(0, 2000)));
              console.log(chalk.yellow('  (response truncated — use --raw for full output)'));
            } else {
              console.log(chalk.white(jsonStr));
            }
          } catch {
            printHeader('Response');
            if (safeText.length > 2000) {
              console.log(chalk.white(safeText.slice(0, 2000)));
              console.log(chalk.yellow('  (response truncated — use --raw for full output)'));
            } else {
              console.log(chalk.white(safeText));
            }
          }
        } else {
          printHeader('Response');
          if (safeText.length > 2000) {
            console.log(chalk.white(safeText.slice(0, 2000)));
            console.log(chalk.yellow('  (response truncated — use --raw for full output)'));
          } else {
            console.log(chalk.white(safeText));
          }
        }
        printSuccess('Call completed successfully.');
      } else {
        printError(`Service returned HTTP ${result.response.status}`);
      }

      console.log();
      await kit.destroy();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function parseUSDC(value: string): bigint {
  // LOW-3 fix: Strip comma thousand-separators (e.g., "1,000.50" -> "1000.50")
  const cleaned = value.replace('$', '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,6})?$/.test(cleaned)) {
    throw new Error('Amount must be a positive number in USDC (e.g., "1.00")');
  }
  const [whole = '0', fraction = ''] = cleaned.split('.');
  const paddedFraction = fraction.padEnd(6, '0');
  return BigInt(whole) * 1_000_000n + BigInt(paddedFraction);
}

function colorStatus(status: number): string {
  if (status >= 200 && status < 300) return chalk.green(status.toString());
  if (status >= 400 && status < 500) return chalk.yellow(status.toString());
  return chalk.red(status.toString());
}
