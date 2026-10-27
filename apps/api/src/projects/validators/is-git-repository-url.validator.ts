import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const ALLOWED_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
]);

export function IsGitRepositoryUrl(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isGitRepositoryUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') {
            return false;
          }

          let url: URL;

          try {
            url = new URL(value);
          } catch {
            return false;
          }

          return (
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            ALLOWED_HOSTS.has(url.hostname.toLowerCase()) &&
            (!url.port || url.port === '443') &&
            !url.search &&
            !url.hash &&
            /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git\/?$/.test(
              url.pathname,
            )
          );
        },

        defaultMessage(args: ValidationArguments): string {
          return `${args.property} debe ser una URL HTTPS válida de GitHub, GitLab o Bitbucket y terminar en .git`;
        },
      },
    });
  };
}