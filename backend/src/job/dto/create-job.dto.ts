import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class CreateJobDto {
  @IsString()
  title: string;

  @IsString()
  company: string;

  @IsString()
  description: string;

  @IsUrl()
  url: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  jobType?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  minSalary?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxSalary?: number;
}
