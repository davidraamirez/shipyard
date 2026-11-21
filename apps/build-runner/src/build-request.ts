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
    throw new Error('The request must be an object');
  }

  const request = value as Record<string, unknown>;

  if (!isDeploymentId(request.deploymentId)) {
    throw new Error('Invalid deploymentId');
  }

  if (
    !Array.isArray(request.commands) ||
    request.commands.length < 1 ||
    request.commands.length > 2
  ) {
    throw new Error('Invalid command list');
  }

  const commands: BuildCommand[] = request.commands.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid command');
    }

    const command = value as Record<string, unknown>;

    if (!isPackageManager(command.command)) {
      throw new Error('Package manager not allowed');
    }

    if (
      !Array.isArray(command.args) ||
      !command.args.every((arg) => typeof arg === 'string')
    ) {
      throw new Error('Invalid arguments');
    }

    const buildCommand: BuildCommand = {
      command: command.command,
      args: [...(command.args as string[])],
    };

    if (!isAllowedBuildCommand(buildCommand)) {
      throw new Error('Command and arguments combination not allowed');
    }

    return buildCommand;
  });

  return {
    deploymentId: request.deploymentId,
    commands,
  };
}
