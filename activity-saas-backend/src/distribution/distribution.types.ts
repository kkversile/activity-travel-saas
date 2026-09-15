import { ChannelContractStatus, DistributionCapability, DistributionChannelType, DistributionEventType } from '@prisma/client';

export type DistributionAuthContext = {
  credentialId: string;
  channelId: string;
  channelCode: string;
  channelName: string;
  channelType: DistributionChannelType;
  contractId: string;
  contractVersion: number;
  contractStatus: ChannelContractStatus;
  capabilities: DistributionCapability[];
  allowedCurrencies: string[];
  availabilityHorizonDays: number;
};

export type DistributionEligibilityGate = { gate: string; status: 'PASS' | 'FAIL' | 'NOT_EVALUATED'; code?: string; message?: string; details?: Record<string, unknown> };
export type DistributionEligibilityResult = { eligible: boolean; gates: DistributionEligibilityGate[]; reasonCodes: string[] };
export type DistributionEventProjection = { type: DistributionEventType; resourceType: string; resourceId: string; externalResourceCode?: string | null; payload: Record<string, unknown> };
