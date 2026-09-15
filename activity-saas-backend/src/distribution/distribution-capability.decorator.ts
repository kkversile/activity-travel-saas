import { SetMetadata } from '@nestjs/common';
import { DistributionCapability } from '@prisma/client';
import { DISTRIBUTION_CAPABILITIES } from './distribution-auth.guard';
export const DistributionCapabilities = (...capabilities: DistributionCapability[]) => SetMetadata(DISTRIBUTION_CAPABILITIES, capabilities);
