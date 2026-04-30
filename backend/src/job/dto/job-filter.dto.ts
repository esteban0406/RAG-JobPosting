import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class JobFilterDto {
  @IsString()
  @IsOptional()
  keyword?: string;

  @IsString()
  @IsOptional()
  jobType?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    return value as boolean;
  })
  isRemote?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minSalary?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxSalary?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
