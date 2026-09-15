import { Controller, Get, Post, Query, Req, UseGuards, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DistributionCapability } from '@prisma/client';
import { DistributionCapabilities } from './distribution-capability.decorator';
import { DistributionAuthGuard, DistributionCapabilityGuard } from './distribution-auth.guard';
import { AvailabilityQueryDto, EventsQueryDto, QuoteDto } from './distribution.dto';
import { DistributionAvailabilityService } from './distribution-availability.service';
import { DistributionCatalogService } from './distribution-catalog.service';
import { DistributionEventService } from './distribution-event.service';
import { DistributionPricingService } from './distribution-pricing.service';
import { DistributionAuthContext } from './distribution.types';

@Controller('distribution/v1')
@ApiTags('Distribution API v1')
@UseGuards(DistributionAuthGuard, DistributionCapabilityGuard)
export class DistributionApiController {
  constructor(private readonly catalog: DistributionCatalogService, private readonly availability: DistributionAvailabilityService, private readonly pricing: DistributionPricingService, private readonly events: DistributionEventService) {}
  @Get('catalog/products') @DistributionCapabilities(DistributionCapability.CATALOG_READ) products(@Req() req: any, @Query('externalProductCode') externalProductCode?: string) { return this.catalog.products(req.distributionContext as DistributionAuthContext, externalProductCode); }
  @Get('catalog/products/:externalProductCode') @DistributionCapabilities(DistributionCapability.CATALOG_READ) product(@Req() req: any, @Param('externalProductCode') externalProductCode: string) { return this.catalog.product(req.distributionContext as DistributionAuthContext, externalProductCode); }
  @Get('availability') @DistributionCapabilities(DistributionCapability.AVAILABILITY_READ) availabilityQuery(@Req() req: any, @Query() query: AvailabilityQueryDto) { return this.availability.availability(req.distributionContext as DistributionAuthContext, query); }
  @Post('quote') @DistributionCapabilities(DistributionCapability.PRICING_READ) quote(@Req() req: any, @Body() dto: QuoteDto) { return this.pricing.quote(req.distributionContext as DistributionAuthContext, dto); }
  @Get('events') @DistributionCapabilities(DistributionCapability.EVENT_READ) eventFeed(@Req() req: any, @Query() query: EventsQueryDto) { return this.events.list(req.distributionContext as DistributionAuthContext, query); }
}
