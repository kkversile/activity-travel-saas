import { CancellationFinancialState, CancellationInitiator, CancellationReasonCategory } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const INR_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export class CancellationPreviewDto {
  @IsOptional() @IsString() reason?: string;
}

export class AgentCancellationDto {
  @IsString() expectedCancellationFingerprint!: string;
  @IsEnum(CancellationReasonCategory) reasonCategory!: CancellationReasonCategory;
  @IsString() reason!: string;
  @IsBoolean() acknowledged = false;
}

export class OperationalCancellationDto {
  @IsEnum(CancellationReasonCategory) reasonCategory!: CancellationReasonCategory;
  @IsString() reason!: string;
}

export class RefundConfirmDto {
  @IsString() externalReference!: string;
  @IsOptional() @IsString() note?: string;
}

export class RefundFailDto {
  @IsString() reason!: string;
}

export class FinancialResolutionDto {
  @IsString() @Matches(INR_DECIMAL, { message: 'cancellationCharge must be a non-negative decimal with at most 2 fractional digits' }) cancellationCharge!: string;
  @IsString() @Matches(INR_DECIMAL, { message: 'refundEntitlement must be a non-negative decimal with at most 2 fractional digits' }) refundEntitlement!: string;
  @IsString() reason!: string;
}

export class AdminCancellationListQueryDto {
  @IsOptional() @IsEnum(CancellationFinancialState) financialState?: CancellationFinancialState;
  @IsOptional() @IsEnum(CancellationInitiator) initiator?: CancellationInitiator;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) createdFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) createdTo?: string;
}
