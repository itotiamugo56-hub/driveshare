import { IsIn, IsString, IsUUID } from 'class-validator';

export class FlagItemDto {
  @IsIn(['review', 'listing']) itemType: string;
  @IsUUID() itemId: string;
  @IsString() flaggedReason: string;
}

export class ResolveItemDto {
  @IsIn(['approved', 'removed']) status: string;
  @IsString() reason: string;
}
