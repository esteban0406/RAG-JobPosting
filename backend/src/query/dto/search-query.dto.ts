import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export enum JobType {
  FullTime = 'full_time',
  PartTime = 'part_time',
  Contract = 'contract',
  Internship = 'internship',
  Remote = 'remote',
}

export class SearchQueryDto {
  @IsString()
  @MinLength(3)
  query: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsNumber()
  minSalary?: number;

  @IsOptional()
  @IsEnum(JobType)
  type?: JobType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contextJobIds?: string[];
}
