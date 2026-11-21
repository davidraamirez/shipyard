
import { describe, expect, it } from 'vitest';
import { getBuildCommands } from './build-strategy.js';
import type { ProjectInfo } from './project-detector.js';

describe('getBuildCommands', () => {
  it('selecciona pnpm install y build', () => {
    const projectInfo: ProjectInfo = {
      type: 'NODE',
      packageManager: 'pnpm',
      buildScript: 'tsc',
    };

    expect(getBuildCommands(projectInfo)).toEqual([
      {
        command: 'pnpm',
        args: ['install', '--frozen-lockfile', '--ignore-scripts'],
      },
      {
        command: 'pnpm',
        args: ['run', 'build', '--ignore-scripts'],
      },
    ]);
  });

  it('selecciona npm ci y build', () => {
    const projectInfo: ProjectInfo = {
      type: 'NODE',
      packageManager: 'npm',
      buildScript: 'tsc',
    };

    expect(getBuildCommands(projectInfo)).toEqual([
      {
        command: 'npm',
        args: ['ci', '--ignore-scripts'],
      },
      {
        command: 'npm',
        args: ['run', 'build', '--ignore-scripts'],
      },
    ]);
  });

  it('does not add the build step without a build script', () => {
    const projectInfo: ProjectInfo = {
      type: 'NODE',
      packageManager: 'pnpm',
      buildScript: null,
    };

    expect(getBuildCommands(projectInfo)).toEqual([
      {
        command: 'pnpm',
        args: ['install', '--frozen-lockfile', '--ignore-scripts'],
      },
    ]);
  });

  it('rejects unknown projects', () => {
    const projectInfo: ProjectInfo = {
      type: 'UNKNOWN',
      packageManager: null,
      buildScript: null,
    };

    expect(() => getBuildCommands(projectInfo)).toThrow(
      'No build strategy for UNKNOWN',
    );
  });

  it('rejects Node without a package manager', () => {
    const projectInfo: ProjectInfo = {
      type: 'NODE',
      packageManager: null,
      buildScript: null,
    };

    expect(() => getBuildCommands(projectInfo)).toThrow(
      'No supported package manager detected',
    );
  });
});
