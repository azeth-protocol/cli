import chalk from 'chalk';

/** Strip ANSI escape codes to prevent terminal injection attacks */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

/** Print a labeled key-value pair */
export function printField(label: string, value: string): void {
  console.log(`  ${chalk.gray(label + ':')}  ${value}`);
}

/** Print a section header */
export function printHeader(title: string): void {
  console.log();
  console.log(chalk.bold.cyan(title));
  console.log(chalk.gray('─'.repeat(title.length + 4)));
}

/** Print a success message */
export function printSuccess(message: string): void {
  console.log(chalk.green(`  ${message}`));
}

/** Print an error message and exit */
export function printError(message: string): void {
  console.error(chalk.red(`Error: ${message}`));
}

/** Format an address for display (truncated) */
export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Format a table row with padded columns */
export function printTableRow(columns: string[], widths: number[]): void {
  const formatted = columns.map((col, i) => {
    const width = widths[i] ?? 12;
    return col.padEnd(width);
  });
  console.log(`  ${formatted.join('  ')}`);
}

/** Print a table header with underlines */
export function printTableHeader(columns: string[], widths: number[]): void {
  printTableRow(columns, widths);
  const underlines = widths.map((w) => '─'.repeat(w));
  printTableRow(underlines, widths);
}
