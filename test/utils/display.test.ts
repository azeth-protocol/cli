import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatAddress,
  printField,
  printHeader,
  printSuccess,
  printError,
  printTableRow,
  printTableHeader,
} from '../../src/utils/display.js';

describe('formatAddress', () => {
  it('truncates a standard 42-char address to 6...4 format', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(formatAddress(addr)).toBe('0x1234...5678');
  });

  it('returns short strings unchanged (<=12 chars)', () => {
    expect(formatAddress('0xABCD')).toBe('0xABCD');
    expect(formatAddress('123456789012')).toBe('123456789012');
  });

  it('truncates strings longer than 12 characters', () => {
    const longStr = '1234567890ABC';
    expect(formatAddress(longStr)).toBe('123456...0ABC');
  });
});

describe('printField', () => {
  it('writes a labeled value to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printField('Chain', 'baseSepolia');

    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0]![0] as string;
    // Strip ANSI to verify content
    const stripped = output.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('Chain:');
    expect(stripped).toContain('baseSepolia');
    spy.mockRestore();
  });
});

describe('printHeader', () => {
  it('prints title and separator line', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printHeader('Test Title');

    // printHeader calls console.log 3 times: blank line, title, separator
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });
});

describe('printSuccess', () => {
  it('writes a success message to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printSuccess('All good');

    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0]![0] as string;
    const stripped = output.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('All good');
    spy.mockRestore();
  });
});

describe('printError', () => {
  it('writes an error message to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    printError('Something failed');

    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0]![0] as string;
    const stripped = output.replace(/\u001b\[[0-9;]*m/g, '');
    expect(stripped).toContain('Error: Something failed');
    spy.mockRestore();
  });
});

describe('printTableRow', () => {
  it('prints columns padded to specified widths', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTableRow(['A', 'BB', 'CCC'], [5, 5, 5]);

    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0]![0] as string;
    // Should contain all columns
    expect(output).toContain('A');
    expect(output).toContain('BB');
    expect(output).toContain('CCC');
    spy.mockRestore();
  });
});

describe('printTableHeader', () => {
  it('prints header row and underline row', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTableHeader(['COL1', 'COL2'], [8, 8]);

    // printTableHeader calls printTableRow twice (header + underlines)
    expect(spy).toHaveBeenCalledTimes(2);
    const underlineOutput = spy.mock.calls[1]![0] as string;
    expect(underlineOutput).toContain('─');
    spy.mockRestore();
  });
});
