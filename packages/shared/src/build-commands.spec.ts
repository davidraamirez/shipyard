import { describe, expect, it } from 'vitest';
import {
  BUILD_ARGS,
  INSTALL_ARGS,
  PACKAGE_MANAGERS,
  isAllowedBuildCommand,
  isPackageManager,
} from './build-commands.js';

describe('isAllowedBuildCommand', () => {
  it.each(PACKAGE_MANAGERS)('acepta install y build de %s', (manager) => {
    expect(
      isAllowedBuildCommand({ command: manager, args: [...INSTALL_ARGS[manager]] }),
    ).toBe(true);
    expect(
      isAllowedBuildCommand({ command: manager, args: [...BUILD_ARGS[manager]] }),
    ).toBe(true);
  });

  it('todas las instalaciones desactivan los scripts del repositorio', () => {
    for (const manager of PACKAGE_MANAGERS) {
      expect(INSTALL_ARGS[manager]).toContain('--ignore-scripts');
    }
  });

  it('rechaza argumentos inyectados', () => {
    expect(
      isAllowedBuildCommand({ command: 'pnpm', args: ['install && rm -rf /'] }),
    ).toBe(false);
  });

  it('rechaza instalar sin --ignore-scripts', () => {
    expect(
      isAllowedBuildCommand({ command: 'npm', args: ['ci'] }),
    ).toBe(false);
  });

  it('rechaza argumentos extra al final', () => {
    expect(
      isAllowedBuildCommand({
        command: 'pnpm',
        args: [...BUILD_ARGS.pnpm, '--filter', 'x'],
      }),
    ).toBe(false);
  });
});

describe('isPackageManager', () => {
  it('solo acepta pnpm, npm y yarn', () => {
    expect(isPackageManager('pnpm')).toBe(true);
    expect(isPackageManager('bash')).toBe(false);
    expect(isPackageManager(undefined)).toBe(false);
  });
});
