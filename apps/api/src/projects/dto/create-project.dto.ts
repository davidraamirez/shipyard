import {
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  repositoryUrl!: string;

  @IsString()
  @IsNotEmpty()
  userId!: string;
}