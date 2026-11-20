export type PackageManager = 'pnpm' | 'npm' | 'yarn';

export type BuildCommand = {
  command: PackageManager;
  args: string[];
};

export const PACKAGE_MANAGERS: readonly PackageManager[] = ['pnpm', 'npm', 'yarn'];

// Los únicos comandos que se ejecutan en un build. El worker los genera a
// partir de aquí y el build-runner rechaza cualquier otra combinación.
// --ignore-scripts evita que el repositorio ejecute hooks (postinstall, etc.).
export const INSTALL_ARGS: Readonly<Record<PackageManager, readonly string[]>> = {
  pnpm: ['install', '--frozen-lockfile', '--ignore-scripts'],
  npm: ['ci', '--ignore-scripts'],
  yarn: ['install', '--immutable', '--ignore-scripts'],
};

// yarn no admite --ignore-scripts en "run".
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
