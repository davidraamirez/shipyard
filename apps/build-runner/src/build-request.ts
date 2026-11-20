import {
  isAllowedBuildCommand,
  isDeploymentId,
  isPackageManager,
  type BuildCommand,
} from '@shipyard/shared';

export type BuildRequest = {
  deploymentId: string;
  commands: BuildCommand[];
};

export function validateBuildRequest(value: unknown): BuildRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('La solicitud debe ser un objeto');
  }

  const request = value as Record<string, unknown>;

  if (!isDeploymentId(request.deploymentId)) {
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

    if (!isPackageManager(command.command)) {
      throw new Error('Gestor de paquetes no permitido');
    }

    if (
      !Array.isArray(command.args) ||
      !command.args.every((arg) => typeof arg === 'string')
    ) {
      throw new Error('Argumentos no válidos');
    }

    const buildCommand: BuildCommand = {
      command: command.command,
      args: [...(command.args as string[])],
    };

    if (!isAllowedBuildCommand(buildCommand)) {
      throw new Error('Combinación de comando y argumentos no permitida');
    }

    return buildCommand;
  });

  return {
    deploymentId: request.deploymentId,
    commands,
  };
}
