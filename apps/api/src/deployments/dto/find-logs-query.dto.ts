import { IsOptional, IsUUID } from 'class-validator';

export class FindLogsQueryDto {
  // Id of the last received log: only later ones are returned.
  @IsOptional()
  @IsUUID()
  after?: string;
}
