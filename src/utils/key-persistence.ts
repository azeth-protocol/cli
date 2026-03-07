/**
 * Private key persistence for the Azeth CLI.
 *
 * Saves and loads private keys from ~/.azeth/key so that quickstart-generated
 * keys persist across CLI invocations without manual `export AZETH_PRIVATE_KEY=...`.
 *
 * File permissions: ~/.azeth/ = 0o700, ~/.azeth/key = 0o600
 * The private key is NEVER logged — only the derived EOA address.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KEY_FILE_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Save a private key to ~/.azeth/key with secure file permissions.
 * Creates ~/.azeth/ directory (0o700) if it doesn't exist.
 * Returns true if saved successfully, false otherwise.
 */
export function saveKey(privateKey: string): boolean {
  const home = homedir();
  if (!home) return false;

  const azethDir = join(home, '.azeth');
  const keyFile = join(azethDir, 'key');

  // Ensure ~/.azeth/ directory exists
  if (existsSync(azethDir)) {
    try {
      if (!statSync(azethDir).isDirectory()) return false;
    } catch {
      return false;
    }
  } else {
    try {
      mkdirSync(azethDir, { recursive: true, mode: 0o700 });
    } catch {
      return false;
    }
  }

  try {
    writeFileSync(keyFile, privateKey, { mode: 0o600 });
    chmodSync(keyFile, 0o600);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a private key from ~/.azeth/key.
 * Returns the key string if found and valid, null otherwise.
 */
export function loadKey(): string | null {
  const home = homedir();
  if (!home) return null;

  const keyFile = join(home, '.azeth', 'key');

  if (!existsSync(keyFile)) return null;

  try {
    const key = readFileSync(keyFile, 'utf-8').trim();
    if (KEY_FILE_RE.test(key)) return key;
    return null;
  } catch {
    return null;
  }
}
