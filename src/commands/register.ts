import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolveOptions, createKit } from '../utils/config.js';
import { printHeader, printField, printSuccess, printError } from '../utils/display.js';
import type { EntityType } from '@azeth/common';

export const registerCommand = new Command('register')
  .description('Register a participant on the ERC-8004 trust registry')
  .requiredOption('--name <name>', 'Participant name')
  .requiredOption('--description <desc>', 'Participant description')
  .option('--type <type>', 'Entity type (agent|service|infrastructure)', 'agent')
  .option('--capabilities <caps>', 'Comma-separated capabilities')
  .option('--endpoint <url>', 'Service endpoint URL')
  .option('--pricing <price>', 'Listed price (e.g., "$0.01/request")')
  .option('--catalog <json>', 'Service catalog JSON array (e.g., \'[{"name":"API","path":"/v1"}]\')')
  .action(async (_opts, cmd: Command) => {
    try {
      const cliOpts = resolveOptions(cmd);
      const localOpts = cmd.opts<{
        name: string;
        description: string;
        type: string;
        capabilities?: string;
        endpoint?: string;
        pricing?: string;
        catalog?: string;
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

      const spinner = ora('Creating AzethKit instance...').start();
      const kit = await createKit(cliOpts);
      spinner.text = `Registering "${localOpts.name}" on ${cliOpts.chain}...`;

      const result = await kit.publishService({
        name: localOpts.name,
        description: localOpts.description,
        entityType: localOpts.type as EntityType,
        capabilities: localOpts.capabilities
          ? localOpts.capabilities.split(',').map((c) => c.trim())
          : [],
        endpoint: localOpts.endpoint,
        pricing: localOpts.pricing,
        catalog: localOpts.catalog ? JSON.parse(localOpts.catalog) : undefined,
      });

      spinner.stop();

      printHeader('Registration Complete');
      printField('Name', localOpts.name);
      printField('Type', localOpts.type);
      printField('Chain', cliOpts.chain);
      printField('Token ID', result.tokenId.toString());
      printField('Tx Hash', chalk.cyan(result.txHash));
      printField('Account', kit.address);
      printSuccess('Participant registered on the trust registry.');

      await kit.destroy();
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
