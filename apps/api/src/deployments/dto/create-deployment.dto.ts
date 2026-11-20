import { IsUUID } from 'class-validator';

export class CreateDeploymentDto {
  @IsUUID()
  projectId!: string;
}
