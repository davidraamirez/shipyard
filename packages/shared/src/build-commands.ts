export type PackageManager = 'pnpm' | 'npm' | 'yarn';

export type BuildCommand = {
  command: PackageManager;
  args: string[];
};

export const PACKAGE_MANAGERS: readonly PackageManager[] = ['pnpm', 'npm', 'yarn'];

// The only commands a build runs. The worker generates them from
// here and the build-runner rejects any other combination.
// --ignore-scripts keeps the repository from running hooks (postinstall, etc.).
export const INSTALL_ARGS: Readonly<Record<PackageManager, readonly string[]>> = {
  pnpm: ['install', '--frozen-lockfile', '--ignore-scripts'],
  npm: ['ci', '--ignore-scripts'],
  yarn: ['install', '--immutable', '--ignore-scripts'],
};

// yarn does not support --ignore-scripts on "run".
export const BUILD_ARGS: Readonly<Record<PackageManager, readonly string[]>> = {
  pnpm: ['run', 'build', '--ignore-scripts'],
  npm: ['run', 'build', '--ignore-scripts'],
  yarn: ['run', 'build'],
};

export function isPackageManager(value: unknown): value is PackageManager {
  return PACKAGE_MANAGERS.includes(value as PackageManager);
}

function sameArgs(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((arg, index) => arg === b[index]);
}

export function isAllowedBuildCommand(command: BuildCommand): boolean {
  return (
    sameArgs(command.args, INSTALL_ARGS[command.command]) ||
    sameArgs(command.args, BUILD_ARGS[command.command])
  );
}
