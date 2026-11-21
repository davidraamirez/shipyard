import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { isValidRepositoryUrl } from '@shipyard/shared';

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
          return isValidRepositoryUrl(value);
        },

        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid HTTPS GitHub, GitLab or Bitbucket URL ending in .git`;
        },
      },
    });
  };
}
