import {
  BUILD_ARGS,
  INSTALL_ARGS,
  type BuildCommand,
} from '@shipyard/shared';
import type { ProjectInfo } from './project-detector.js';

export function getBuildCommands(
  projectInfo: ProjectInfo,
): BuildCommand[] {
  if (projectInfo.type !== 'NODE') {
    throw new Error(
      `No build strategy for ${projectInfo.type}`,
    );
  }

  const manager = projectInfo.packageManager;

  if (!manager) {
    throw new Error(
      'No supported package manager detected',
    );
  }

  const commands: BuildCommand[] = [
    { command: manager, args: [...INSTALL_ARGS[manager]] },
  ];

  if (projectInfo.buildScript) {
    commands.push({ command: manager, args: [...BUILD_ARGS[manager]] });
  }

  return commands;
}
