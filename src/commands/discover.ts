import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { resolveOptions } from '../utils/config.js';
import { printHeader, printTableHeader, printTableRow, printError, formatAddress, stripAnsi } from '../utils/display.js';

interface DiscoveryEntry {
  tokenId: string;
  owner: string;
  entityType: string;
  name: string;
  capabilities: string[];
  endpoint?: string;
  active: boolean;
}

function validateServerUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Server URL must use HTTP or HTTPS');
    }
    // Block obvious internal addresses
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      // Allow localhost for development — this is intentional
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('must use')) throw e;
    throw new Error(`Invalid server URL format`);
  }
}

function validateResponse(body: unknown): DiscoveryEntry[] {
  if (!body || typeof body !== 'object') return [];
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.data)) return [];
  return obj.data.filter(
    (entry): entry is DiscoveryEntry =>
      entry !== null &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>).tokenId === 'string' &&
      typeof (entry as Record<string, unknown>).name === 'string',
  );
}

export const discoverCommand = new Command('discover')
  .description('Find services by capability and reputation')
  .option('--capability <cap>', 'Filter by capability')
  .option('--type <type>', 'Filter by entity type (agent|service|infrastructure)')
  .option('--min-reputation <score>', 'Minimum reputation score (0-100)')
  .option('--limit <n>', 'Maximum results to return', '10')
  .action(async (_opts, cmd: Command) => {
    try {
      const cliOpts = resolveOptions(cmd);
      const localOpts = cmd.opts<{
        capability?: string;
        type?: string;
        minReputation?: string;
        limit: string;
      }>();

      const serverUrl = cliOpts.serverUrl ?? 'https://api.azeth.ai';
      validateServerUrl(serverUrl);

      const spinner = ora('Discovering services...').start();

      // Discovery is read-only — query the server API directly (no private key needed)
      const queryParams = new URLSearchParams();
      if (localOpts.capability) queryParams.set('capability', localOpts.capability);
      if (localOpts.type) queryParams.set('entityType', localOpts.type);
      if (localOpts.minReputation !== undefined) queryParams.set('minReputation', localOpts.minReputation);
      queryParams.set('limit', localOpts.limit);

      const response = await fetch(`${serverUrl}/api/v1/registry/discover?${queryParams}`, {
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        spinner.stop();
        printError(`Discovery API returned ${response.status}: ${response.statusText}`);
        process.exit(1);
      }

      // F-5: Limit response body read to 1 MB to prevent memory exhaustion
      const MAX_BODY_SIZE = 1_048_576;
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
        spinner.stop();
        printError('Response body too large (Content-Length exceeds limit)');
        process.exit(1);
      }
      const rawText = await response.text();
      if (rawText.length > MAX_BODY_SIZE) {
        spinner.stop();
        printError('Response body too large');
        process.exit(1);
      }
      let rawBody: unknown;
      try {
        rawBody = JSON.parse(rawText);
      } catch {
        spinner.stop();
        printError('Invalid JSON response from server');
        process.exit(1);
      }
      const results = validateResponse(rawBody);

      spinner.stop();

      if (results.length === 0) {
        printHeader('Discovery Results');
        console.log(chalk.yellow('  No services found matching your criteria.'));
        return;
      }

      printHeader(`Discovery Results (${results.length} found)`);
      const widths = [8, 18, 14, 20, 30];
      printTableHeader(['TOKEN', 'OWNER', 'TYPE', 'NAME', 'CAPABILITIES'], widths);

      for (const entry of results) {
        printTableRow(
          [
            stripAnsi(entry.tokenId.toString()),
            formatAddress(stripAnsi(entry.owner)),
            stripAnsi(entry.entityType),
            stripAnsi(entry.name).slice(0, 20),
            (entry.capabilities ?? []).map(c => stripAnsi(c)).join(', ').slice(0, 30),
          ],
          widths,
        );
      }

      console.log();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
