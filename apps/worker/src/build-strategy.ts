import type { ProjectInfo } from './project-detector.js';

export type BuildCommand = {
  command: 'pnpm' | 'npm' | 'yarn';
  args: string[];
};

export function getBuildCommands(
  projectInfo: ProjectInfo,
): BuildCommand[] {
  if (projectInfo.type !== 'NODE') {
    throw new Error(
      `No existe una estrategia de build para ${projectInfo.type}`,
    );
  }

  const manager = projectInfo.packageManager;

  if (!manager) {
    throw new Error(
      'No se ha detectado un gestor de paquetes compatible',
    );
  }

  const installArgs = {
    pnpm: ['install', '--frozen-lockfile', '--ignore-scripts'],
    npm: ['ci', '--ignore-scripts'],
    yarn: ['install', '--immutable', '--ignore-scripts'],
  } as const;

  const commands: BuildCommand[] = [
    {
      command: manager,
      args: [...installArgs[manager]],
    },
  ];

  if (projectInfo.buildScript) {
    commands.push({
      command: manager,
      args:
        manager === 'yarn'
          ? ['run', 'build']
          : ['run', 'build', '--ignore-scripts'],
    });
  }

  return commands;
}
