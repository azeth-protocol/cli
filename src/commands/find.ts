import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveOptions } from '../utils/config.js';
import { printHeader, printTableHeader, printTableRow, printError, formatAddress, stripAnsi } from '../utils/display.js';

interface FindResult {
  tokenId: string;
  owner: string;
  entityType: string;
  name: string;
  capabilities: string[];
  endpoint?: string;
  active: boolean;
}

export const findCommand = new Command('find')
  .description('Find services by capability and reputation')
  .argument('[query]', 'Search query (matches name, description, or capabilities)')
  .option('--capability <cap>', 'Filter by specific capability')
  .option('--type <type>', 'Filter by entity type (agent|service|infrastructure)')
  .option('--min-rep <score>', 'Minimum reputation score (0-100)')
  .option('--limit <n>', 'Maximum results', '10')
  .action(async (query: string | undefined, _opts, cmd: Command) => {
    try {
      const cliOpts = resolveOptions(cmd);
      const localOpts = cmd.opts<{
        capability?: string;
        type?: string;
        minRep?: string;
        limit: string;
      }>();

      const serverUrl = cliOpts.serverUrl ?? 'https://api.azeth.ai';

      const spinner = ora('Searching trust registry...').start();

      const params = new URLSearchParams();
      if (query) params.set('capability', query);
      if (localOpts.capability) params.set('capability', localOpts.capability);
      if (localOpts.type) params.set('entityType', localOpts.type);
      if (localOpts.minRep) params.set('minReputation', localOpts.minRep);
      params.set('limit', localOpts.limit);

      const response = await fetch(`${serverUrl}/api/v1/registry/discover?${params}`, {
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        spinner.stop();
        printError(`Registry API returned ${response.status}`);
        process.exit(1);
      }

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
        printError('Response too large');
        process.exit(1);
      }

      let rawBody: unknown;
      try {
        rawBody = JSON.parse(rawText);
      } catch {
        spinner.stop();
        printError('Invalid JSON from registry');
        process.exit(1);
      }

      const results = validateResults(rawBody);
      spinner.stop();

      if (results.length === 0) {
        printHeader('Search Results');
        console.log(chalk.yellow('  No services found matching your criteria.'));
        console.log(chalk.gray('  Try broader search terms or lower --min-rep.'));
        return;
      }

      printHeader(`Found ${results.length} Service${results.length > 1 ? 's' : ''}`);
      const widths = [8, 18, 12, 20, 30];
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

function validateResults(body: unknown): FindResult[] {
  if (!body || typeof body !== 'object') return [];
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.data)) return [];
  return obj.data.filter(
    (e): e is FindResult =>
      e !== null &&
      typeof e === 'object' &&
      typeof (e as Record<string, unknown>).tokenId === 'string' &&
      typeof (e as Record<string, unknown>).name === 'string',
  );
}
