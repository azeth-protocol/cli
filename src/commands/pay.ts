import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveOptions, createKit } from '../utils/config.js';
import { printHeader, printField, printSuccess, printError, stripAnsi } from '../utils/display.js';

/** L-4: Parse --max-amount as human-readable USDC (e.g. "10" = 10 USDC, "0.50" = 0.50 USDC).
 *  Converts to atomic units (6 decimals) for consistency with MCP tool inputs.
 *  LOW-3 (Audit): Comma thousand-separators are intentionally stripped (e.g., "1,000.50" ->
 *  "1000.50") as a CLI convenience for human-facing input. The SDK does NOT perform this
 *  normalization — machine callers should provide raw numeric strings. */
function parseMaxAmount(value: string): bigint {
  const cleaned = value.replace('$', '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,6})?$/.test(cleaned)) {
    throw new Error('--max-amount must be a positive number in USDC (e.g., "10" for 10 USDC, "0.50" for 50 cents)');
  }
  const [whole = '0', fraction = ''] = cleaned.split('.');
  const paddedFraction = fraction.padEnd(6, '0');
  return BigInt(whole) * 1_000_000n + BigInt(paddedFraction);
}

export const payCommand = new Command('pay')
  .description('Pay for an x402-gated service')
  .argument('<url>', 'URL of the x402-gated service')
  .option('--method <method>', 'HTTP method (GET|POST)', 'GET')
  .option('--max-amount <amount>', 'Maximum payment amount in USDC (e.g., "10" for 10 USDC)')
  .option('--body <json>', 'JSON request body (for POST)')
  .action(async (url: string, _opts, cmd: Command) => {
    try {
      const cliOpts = resolveOptions(cmd);
      const localOpts = cmd.opts<{
        method: string;
        maxAmount?: string;
        body?: string;
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
      spinner.text = `Fetching ${url}...`;

      const result = await kit.fetch402(url, {
        method: localOpts.method,
        maxAmount: localOpts.maxAmount ? parseMaxAmount(localOpts.maxAmount) : undefined,
        body: localOpts.body,
      });

      spinner.stop();

      printHeader('x402 Payment Result');
      printField('URL', url);
      printField('Method', localOpts.method);
      printField('Status', result.response.status.toString());
      printField('Payment Made', result.paymentMade ? chalk.green('Yes') : chalk.gray('No'));

      if (result.paymentMade && result.amount !== undefined) {
        // USDC has 6 decimals
        const usdcFormatted = (Number(result.amount) / 1_000_000).toFixed(6);
        printField('Amount', `${usdcFormatted} USDC`);
      }

      if (result.response.ok) {
        // F-5: Limit response body read to 1 MB to prevent memory exhaustion from huge responses
        const MAX_BODY_SIZE = 1_048_576;
        const contentLength = result.response.headers.get('content-length');
        // Audit #10: Handle NaN from invalid Content-Length (NaN > X is always false)
        const parsedLength = contentLength ? Number(contentLength) : 0;
        if (contentLength && (!Number.isFinite(parsedLength) || parsedLength > MAX_BODY_SIZE)) {
          spinner.stop();
          printError('Response body too large (Content-Length exceeds limit)');
          process.exit(1);
        }
        const text = await result.response.text();
        if (text.length > MAX_BODY_SIZE) {
          spinner.stop();
          printError('Response body too large');
          process.exit(1);
        }
        // M-2: Strip ANSI escape codes from external response to prevent terminal injection
        const safeText = stripAnsi(text);

        const contentType = result.response.headers.get('content-type') ?? '';
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
        printSuccess('Request completed successfully.');
      } else {
        printError(`Service returned HTTP ${result.response.status}`);
      }

      await kit.destroy();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
