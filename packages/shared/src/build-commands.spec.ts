import { describe, expect, it } from 'vitest';
import {
  BUILD_ARGS,
  INSTALL_ARGS,
  PACKAGE_MANAGERS,
  isAllowedBuildCommand,
  isPackageManager,
} from './build-commands.js';

describe('isAllowedBuildCommand', () => {
  it.each(PACKAGE_MANAGERS)('accepts install and build for %s', (manager) => {
    expect(
      isAllowedBuildCommand({ command: manager, args: [...INSTALL_ARGS[manager]] }),
    ).toBe(true);
    expect(
      isAllowedBuildCommand({ command: manager, args: [...BUILD_ARGS[manager]] }),
    ).toBe(true);
  });

  it('every install disables repository scripts', () => {
    for (const manager of PACKAGE_MANAGERS) {
      expect(INSTALL_ARGS[manager]).toContain('--ignore-scripts');
    }
  });

  it('rejects injected arguments', () => {
    expect(
      isAllowedBuildCommand({ command: 'pnpm', args: ['install && rm -rf /'] }),
    ).toBe(false);
  });

  it('rejects installing without --ignore-scripts', () => {
    expect(
      isAllowedBuildCommand({ command: 'npm', args: ['ci'] }),
    ).toBe(false);
  });

  it('rejects trailing extra arguments', () => {
    expect(
      isAllowedBuildCommand({
        command: 'pnpm',
        args: [...BUILD_ARGS.pnpm, '--filter', 'x'],
      }),
    ).toBe(false);
  });
});

describe('isPackageManager', () => {
  it('only accepts pnpm, npm and yarn', () => {
    expect(isPackageManager('pnpm')).toBe(true);
    expect(isPackageManager('bash')).toBe(false);
    expect(isPackageManager(undefined)).toBe(false);
  });
});
