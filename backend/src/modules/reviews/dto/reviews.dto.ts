import { IsArray, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class SubmitReviewDto {
  @IsUUID() tripId: string;
  @IsUUID() subjectUserId: string;
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() comment?: string;
}

export class AttachMediaDto {
  @IsArray() mediaRefs: string[];
}
