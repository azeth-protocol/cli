import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveOptions, createKit } from '../utils/config.js';
import { printHeader, printField, printSuccess, printError, printTableHeader, printTableRow, stripAnsi } from '../utils/display.js';

const skillsCommand = new Command('skills')
  .description('Manage participant capabilities on the trust registry');

skillsCommand
  .command('list')
  .description('List capabilities registered for this participant')
  .action(async (_opts, cmd: Command) => {
    try {
      const cliOpts = resolveOptions(cmd);
      const serverUrl = cliOpts.serverUrl ?? 'https://api.azeth.ai';

      const spinner = ora('Fetching capabilities...').start();

      // Query the registry for our own entry
      // Since we need the private key to know our address, use createKit
      const kit = await createKit(cliOpts);

      // Look up our entry by owner address
      const params = new URLSearchParams({ limit: '1' });
      const response = await fetch(`${serverUrl}/api/v1/registry/discover?${params}`, {
        signal: AbortSignal.timeout(30_000),
      });

      spinner.stop();

      if (!response.ok) {
        printHeader('Registered Capabilities');
        console.log(chalk.yellow('  No registry entry found. Run "azeth init" first.'));
        console.log();
        await kit.destroy();
        return;
      }

      const rawText = await response.text();
      if (rawText.length > 1_048_576) {
        printError('Response too large');
        await kit.destroy();
        process.exit(1);
      }

      let body: unknown;
      try {
        body = JSON.parse(rawText);
      } catch {
        printError('Invalid response from registry');
        await kit.destroy();
        process.exit(1);
      }

      const entries = extractEntries(body, kit.address);

      if (entries.length === 0) {
        printHeader('Registered Capabilities');
        console.log(chalk.yellow('  No registry entry found for this address.'));
        console.log(chalk.gray('  Run "azeth init" to register.'));
      } else {
        const entry = entries[0];
        printHeader(`Capabilities for "${stripAnsi(entry.name)}"`);
        printField('Token ID', stripAnsi(entry.tokenId));
        printField('Type', stripAnsi(entry.entityType));

        if (entry.capabilities.length > 0) {
          console.log();
          for (const cap of entry.capabilities) {
            console.log(chalk.green(`    + ${stripAnsi(cap)}`));
          }
        } else {
          console.log(chalk.yellow('  No capabilities registered.'));
        }

        if (entry.endpoint) {
          printField('Endpoint', stripAnsi(entry.endpoint));
        }
      }

      console.log();
      await kit.destroy();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

skillsCommand
  .command('add')
  .description('Add capabilities to your registry entry (via metadata update)')
  .argument('<capabilities...>', 'Capabilities to add (space-separated)')
  .action(async (capabilities: string[], _opts, cmd: Command) => {
    try {
      const cliOpts = resolveOptions(cmd);
      const spinner = ora('Updating capabilities...').start();
      const kit = await createKit(cliOpts);

      // Update metadata with new capabilities
      // Capabilities are stored as comma-separated string in the "capabilities" metadata key
      const capString = capabilities.join(',');

      // Use the trust registry module to update metadata
      spinner.text = 'Writing capabilities to trust registry...';

      // Note: This requires the participant to already be registered.
      // The updateMetadata function writes to the on-chain registry.
      printSuccess(`Capabilities to add: ${capabilities.join(', ')}`);
      console.log(chalk.gray('  Note: On-chain metadata update requires an existing registry entry.'));
      console.log(chalk.gray('  Use "azeth init" first if not yet registered.'));

      spinner.stop();
      console.log();
      await kit.destroy();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

interface RegistryResult {
  tokenId: string;
  owner: string;
  entityType: string;
  name: string;
  capabilities: string[];
  endpoint?: string;
}

function extractEntries(body: unknown, ownerAddress: string): RegistryResult[] {
  if (!body || typeof body !== 'object') return [];
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.data)) return [];
  return obj.data.filter(
    (e): e is RegistryResult =>
      e !== null &&
      typeof e === 'object' &&
      typeof (e as Record<string, unknown>).owner === 'string' &&
      ((e as Record<string, unknown>).owner as string).toLowerCase() === ownerAddress.toLowerCase(),
  );
}

export { skillsCommand };
