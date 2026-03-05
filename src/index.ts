import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { registerCommand } from './commands/register.js';
import { discoverCommand } from './commands/discover.js';
import { findCommand } from './commands/find.js';
import { callCommand } from './commands/call.js';
import { payCommand } from './commands/pay.js';
import { statusCommand } from './commands/status.js';
import { reputationCommand } from './commands/reputation.js';
import { skillsCommand } from './commands/skills.js';
import { agreementsCommand } from './commands/agreements.js';

const program = new Command()
  .name('azeth')
  .description('Azeth.ai CLI — Trust Infrastructure for the Machine Economy')
  .version('0.1.0')
  .option('--chain <chain>', 'Chain to use (base|baseSepolia|ethereumSepolia|ethereum)', 'baseSepolia')
  .option('--rpc-url <url>', 'RPC URL (or set BASE_RPC_URL)')
  .option('--server-url <url>', 'Azeth server URL (or set AZETH_SERVER_URL)');

// Daily porcelain commands
program.addCommand(initCommand);
program.addCommand(callCommand);
program.addCommand(findCommand);
program.addCommand(statusCommand);
program.addCommand(skillsCommand);
program.addCommand(reputationCommand);
program.addCommand(agreementsCommand);

// Plumbing commands (existing)
program.addCommand(registerCommand);
program.addCommand(discoverCommand);
program.addCommand(payCommand);

program.parse();
