/**
 * Global test setup for @azeth/cli.
 *
 * Isolates the suite from the developer's real home directory. `createKit()`
 * falls back to a key persisted at `~/.azeth/key` (written by `azeth quickstart`).
 * On any machine where that file exists, the "no private key" guard never trips
 * and the corresponding command tests fail with a misleading downstream error —
 * pure environment pollution, not a product bug (CI containers have no such file,
 * so they stay green while local dev runs go red).
 *
 * Redirecting HOME/USERPROFILE to a fresh empty temp dir makes the suite
 * hermetic: `loadKey()` finds nothing, the guard fires as intended, and any
 * key read/write in tests is sandboxed away from the real `~/.azeth/`.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isolatedHome = mkdtempSync(join(tmpdir(), 'azeth-cli-test-home-'));
process.env['HOME'] = isolatedHome;
process.env['USERPROFILE'] = isolatedHome;
