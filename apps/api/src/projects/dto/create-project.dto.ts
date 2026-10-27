import {
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsGitRepositoryUrl } from '../validators/is-git-repository-url.validator.js';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsGitRepositoryUrl()
  repositoryUrl!: string;
}