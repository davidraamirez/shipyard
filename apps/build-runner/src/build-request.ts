export type PackageManager = 'pnpm' | 'npm' | 'yarn';

export type BuildCommand = {
  command: PackageManager;
  args: string[];
};

export type BuildRequest = {
  deploymentId: string;
  commands: BuildCommand[];
};

const ALLOWED_COMMANDS: Record<PackageManager, string[][]> = {
  pnpm: [
    ['install', '--frozen-lockfile', '--ignore-scripts'],
    ['run', 'build', '--ignore-scripts'],
  ],
  npm: [
    ['ci', '--ignore-scripts'],
    ['run', 'build', '--ignore-scripts'],
  ],
  yarn: [
    ['install', '--immutable', '--ignore-scripts'],
    ['run', 'build'],
  ],
};

export function validateBuildRequest(value: unknown): BuildRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('La solicitud debe ser un objeto');
  }

  const request = value as Record<string, unknown>;

  if (
    typeof request.deploymentId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(request.deploymentId)
  ) {
    throw new Error('deploymentId no válido');
  }

  if (
    !Array.isArray(request.commands) ||
    request.commands.length < 1 ||
    request.commands.length > 2
  ) {
    throw new Error('La lista de comandos no es válida');
  }

  const commands: BuildCommand[] = request.commands.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Comando no válido');
    }

    const command = value as Record<string, unknown>;

    if (
      command.command !== 'pnpm' &&
      command.command !== 'npm' &&
      command.command !== 'yarn'
    ) {
      throw new Error('Gestor de paquetes no permitido');
    }

    if (
      !Array.isArray(command.args) ||
      !command.args.every((arg) => typeof arg === 'string')
    ) {
      throw new Error('Argumentos no válidos');
    }

    const args = command.args as string[];
    const manager = command.command as PackageManager;

    const allowed = ALLOWED_COMMANDS[manager].some(
      (allowedArgs) =>
        allowedArgs.length === args.length &&
        allowedArgs.every((arg, index) => arg === args[index]),
    );

    if (!allowed) {
      throw new Error('Combinación de comando y argumentos no permitida');
    }

    return { command: manager, args: [...args] };
  });

  return {
    deploymentId: request.deploymentId,
    commands,
  };
}
