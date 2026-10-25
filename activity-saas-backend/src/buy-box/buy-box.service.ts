import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BuyBoxBidStatus, BuyBoxOfferStatus, BuyBoxSelectionPolicy, BuyBoxStatus, ExperienceDisplayMode, OfferSelectionPolicy, ProductRevisionStatus, ProductStatus, TenantKind } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AddBuyBoxOfferDto, SubmitBuyBoxBidDto, UpdateBuyBoxDto, UpsertBuyBoxDto } from './buy-box.dto';

const vendorSelect = { id: true, name: true, vendorProfile: { select: { legalBusinessName: true, verificationStatus: true } } } as const;

@Injectable()
export class BuyBoxService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private isOpen(box: any, now = new Date()) {
    return box?.status === BuyBoxStatus.OPEN && (!box.startsAt || box.startsAt <= now) && (!box.endsAt || box.endsAt > now);
  }

  private productState(product: any) {
    const published = product.status === ProductStatus.LIVE && product.currentRevision?.status === ProductRevisionStatus.PUBLISHED;
    const verified = product.tenant?.vendorProfile?.verificationStatus === 'VERIFIED';
    return { eligible: Boolean(published && verified), reason: !published ? 'Product is not live with a published revision' : !verified ? 'Vendor is not verified' : null };
  }

  private currentBid(offer: any, now = new Date()) {
    const bids = (offer.bids || []).filter((bid: any) => bid.status === BuyBoxBidStatus.ACTIVE && (!bid.startsAt || bid.startsAt <= now) && (!bid.endsAt || bid.endsAt > now));
    return bids.sort((a: any, b: any) => Number(b.amount) - Number(a.amount) || new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())[0] || null;
  }

  private offerView(offer: any, now = new Date(), revealBid = true) {
    const state = this.productState(offer.product);
    const bid = this.currentBid(offer, now);
    return {
      id: offer.id,
      productId: offer.productId,
      vendorId: offer.vendorId,
      vendorName: offer.vendor?.vendorProfile?.legalBusinessName || offer.vendor?.name || offer.vendorId,
      productName: offer.product?.currentRevision?.productName || offer.product?.productCode,
      productCode: offer.product?.productCode,
      status: offer.status,
      eligible: state.eligible && offer.status === BuyBoxOfferStatus.ACTIVE,
      eligibilityReason: state.reason,
      currentBid: revealBid && bid ? { id: bid.id, amount: Number(bid.amount), currency: bid.currency, submittedAt: bid.submittedAt, endsAt: bid.endsAt } : undefined,
    };
  }

  private async getBox(id: string) {
    const box: any = await this.prisma.buyBox.findUnique({ where: { id }, include: { experienceMaster: { include: { products: { include: { currentRevision: true, tenant: { select: vendorSelect } } } } }, offers: { include: { product: { include: { currentRevision: true, tenant: { select: vendorSelect } } }, vendor: { select: vendorSelect }, bids: { where: { status: BuyBoxBidStatus.ACTIVE }, orderBy: { submittedAt: 'desc' } } } } } });
    if (!box) throw new NotFoundException('Buy Box not found');
    return box;
  }

  async adminList() {
    const masters: any[] = await this.prisma.experienceMaster.findMany({ orderBy: { updatedAt: 'desc' }, include: { products: { include: { currentRevision: true, tenant: { select: vendorSelect } } }, buyBox: { include: { offers: { include: { product: { include: { currentRevision: true, tenant: { select: vendorSelect } } }, vendor: { select: vendorSelect }, bids: { where: { status: BuyBoxBidStatus.ACTIVE }, orderBy: { submittedAt: 'desc' } } } } } } } });
    return masters.map((master) => {
      const box = master.buyBox;
      const offers = box?.offers?.filter((offer: any) => offer.status === BuyBoxOfferStatus.ACTIVE).map((offer: any) => this.offerView(offer)).filter((offer: any) => offer.eligible) || [];
      const ranked = offers.filter((offer: any) => offer.eligible).sort((a: any, b: any) => (b.currentBid?.amount || 0) - (a.currentBid?.amount || 0));
      return { id: box?.id || null, experienceMasterId: master.id, canonicalName: master.canonicalName, status: box?.status || BuyBoxStatus.CLOSED, displayMode: box?.displayMode || ExperienceDisplayMode.SINGLE_OFFER, selectionPolicy: box?.selectionPolicy || BuyBoxSelectionPolicy.HIGHEST_BID, fallbackPolicy: box?.fallbackPolicy || OfferSelectionPolicy.CHEAPEST, currency: box?.currency || 'INR', minimumBidAmount: box?.minimumBidAmount == null ? null : Number(box.minimumBidAmount), minimumBidIncrement: box?.minimumBidIncrement == null ? null : Number(box.minimumBidIncrement), startsAt: box?.startsAt || null, endsAt: box?.endsAt || null, offerCount: offers.length, eligibleOfferCount: offers.filter((offer: any) => offer.eligible).length, winner: ranked[0] || null };
    });
  }

  async adminDetail(id: string) {
    const box = await this.getBox(id);
    const eligibleProducts = box.experienceMaster.products.filter((product: any) => this.productState(product).eligible).map((product: any) => ({ id: product.id, productCode: product.productCode, name: product.currentRevision?.productName || product.productCode, vendorId: product.tenantId, vendorName: product.tenant?.vendorProfile?.legalBusinessName || product.tenant?.name || product.tenantId }));
    return { id: box.id, experienceMasterId: box.experienceMasterId, canonicalName: box.experienceMaster.canonicalName, status: box.status, displayMode: box.displayMode, selectionPolicy: box.selectionPolicy, fallbackPolicy: box.fallbackPolicy, currency: box.currency, minimumBidAmount: box.minimumBidAmount == null ? null : Number(box.minimumBidAmount), minimumBidIncrement: box.minimumBidIncrement == null ? null : Number(box.minimumBidIncrement), startsAt: box.startsAt, endsAt: box.endsAt, eligibleProducts, offers: box.offers.filter((offer: any) => offer.status === BuyBoxOfferStatus.ACTIVE).map((offer: any) => this.offerView(offer)).filter((offer: any) => offer.eligible) };
  }

  async upsertAdmin(actor: AuthUser, dto: UpsertBuyBoxDto | UpdateBuyBoxDto, id?: string) {
    const masterId = id ? (await this.getBox(id)).experienceMasterId : (dto as UpsertBuyBoxDto).experienceMasterId;
    const master = await this.prisma.experienceMaster.findUnique({ where: { id: masterId }, include: { products: { include: { currentRevision: true, tenant: { select: vendorSelect } } } } });
    if (!master) throw new NotFoundException('Experience master not found');
    const data: any = { status: dto.status, displayMode: dto.displayMode, selectionPolicy: dto.selectionPolicy, fallbackPolicy: dto.fallbackPolicy, currency: dto.currency?.trim().toUpperCase(), minimumBidAmount: dto.minimumBidAmount, minimumBidIncrement: dto.minimumBidIncrement, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined, updatedById: actor.sub };
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    if (data.status === BuyBoxStatus.OPEN && master.products.filter((product: any) => this.productState(product).eligible).length < 2) throw new ConflictException('Buy Box needs at least two eligible Live products with published revisions');
    const box: any = id ? await this.prisma.buyBox.update({ where: { id }, data }) : await this.prisma.buyBox.upsert({ where: { experienceMasterId: masterId }, update: data, create: { id: randomUUID(), experienceMasterId: masterId, status: data.status || BuyBoxStatus.CLOSED, displayMode: data.displayMode || ExperienceDisplayMode.SINGLE_OFFER, selectionPolicy: data.selectionPolicy || BuyBoxSelectionPolicy.HIGHEST_BID, fallbackPolicy: data.fallbackPolicy || OfferSelectionPolicy.CHEAPEST, currency: data.currency || 'INR', minimumBidAmount: data.minimumBidAmount, minimumBidIncrement: data.minimumBidIncrement, startsAt: data.startsAt, endsAt: data.endsAt, createdById: actor.sub, updatedById: actor.sub } });
    await this.audit.write(this.prisma, { actor, action: 'BUY_BOX_UPDATED', entityType: 'BuyBox', entityId: box.id, afterState: data });
    return this.adminDetail(box.id);
  }

  async addOffer(actor: AuthUser, boxId: string, dto: AddBuyBoxOfferDto) {
    const box = await this.getBox(boxId);
    const product: any = await this.prisma.product.findFirst({ where: { id: dto.productId, experienceMasterId: box.experienceMasterId, deletedAt: null, tenant: { kind: TenantKind.VENDOR } }, include: { tenant: { select: vendorSelect }, currentRevision: true } });
    if (!product) throw new ConflictException('Product must be linked to this experience master');
    if (!this.productState(product).eligible) throw new ConflictException('Only Live products with a published revision from a verified vendor can be added to a Buy Box');
    const existing: any = await this.prisma.buyBoxOffer.findUnique({ where: { buyBoxId_productId: { buyBoxId: boxId, productId: product.id } } });
    const offer: any = existing ? await this.prisma.buyBoxOffer.update({ where: { id: existing.id }, data: { status: BuyBoxOfferStatus.ACTIVE, manuallyEnabled: true } }) : await this.prisma.buyBoxOffer.create({ data: { id: randomUUID(), buyBoxId: boxId, productId: product.id, vendorId: product.tenantId } });
    await this.audit.write(this.prisma, { actor, action: 'BUY_BOX_OFFER_ADDED', entityType: 'BuyBox', entityId: boxId, afterState: { productId: product.id, vendorId: product.tenantId } });
    return this.adminDetail(offer.buyBoxId);
  }

  async removeOffer(actor: AuthUser, boxId: string, offerId: string) {
    await this.getBox(boxId);
    await this.prisma.buyBoxOffer.update({ where: { id: offerId, buyBoxId: boxId }, data: { status: BuyBoxOfferStatus.REMOVED } });
    await this.audit.write(this.prisma, { actor, action: 'BUY_BOX_OFFER_REMOVED', entityType: 'BuyBox', entityId: boxId, afterState: { offerId } });
    return this.adminDetail(boxId);
  }

  async vendorOpportunities(user: AuthUser) {
    if (!user.tenantId) throw new ForbiddenException('Vendor tenant is required');
    const boxes: any[] = await this.prisma.buyBox.findMany({ where: { status: BuyBoxStatus.OPEN, offers: { some: { vendorId: user.tenantId, status: BuyBoxOfferStatus.ACTIVE } } }, include: { experienceMaster: true, offers: { where: { status: BuyBoxOfferStatus.ACTIVE }, include: { product: { include: { currentRevision: true, tenant: { select: vendorSelect } } }, vendor: { select: vendorSelect }, bids: { where: { status: BuyBoxBidStatus.ACTIVE }, orderBy: { submittedAt: 'desc' } } } } } });
    return boxes
      .filter((box) => this.isOpen(box) && box.offers.filter((offer: any) => this.productState(offer.product).eligible).length > 1)
      .map((box) => this.vendorOpportunity(box, user.tenantId as string))
      .filter(Boolean);
  }

  private vendorOpportunity(box: any, vendorId: string) {
    const eligible = box.offers.filter((offer: any) => this.productState(offer.product).eligible);
    const own = eligible.find((offer: any) => offer.vendorId === vendorId);
    if (!own) return null;
    const allBids = eligible.map((offer: any) => this.currentBid(offer)).filter(Boolean).sort((a: any, b: any) => Number(b.amount) - Number(a.amount));
    const ownBid = own ? this.currentBid(own) : null;
    return { id: box.id, experienceMasterId: box.experienceMasterId, canonicalName: box.experienceMaster.canonicalName, displayMode: box.displayMode, selectionPolicy: box.selectionPolicy, currency: box.currency, status: box.status, startsAt: box.startsAt, endsAt: box.endsAt, product: { id: own.productId, name: own.product.currentRevision?.productName || own.product.productCode, productCode: own.product.productCode }, otherOfferCount: Math.max(0, eligible.length - 1), currentBid: ownBid ? { amount: Number(ownBid.amount), currency: ownBid.currency, submittedAt: ownBid.submittedAt, endsAt: ownBid.endsAt } : null, currentRank: ownBid ? allBids.findIndex((bid: any) => bid.id === ownBid.id) + 1 : null, minimumBidAmount: box.minimumBidAmount == null ? 0 : Number(box.minimumBidAmount), minimumBidIncrement: box.minimumBidIncrement == null ? 1 : Number(box.minimumBidIncrement) };
  }

  async vendorDetail(user: AuthUser, boxId: string) {
    const items = await this.vendorOpportunities(user); const found = items.find((item) => item && item.id === boxId); if (!found) throw new NotFoundException('Buy Box opportunity not found'); return found;
  }

  async submitBid(user: AuthUser, boxId: string, dto: SubmitBuyBoxBidDto) {
    if (!user.tenantId) throw new ForbiddenException('Vendor tenant is required');
    const box = await this.getBox(boxId); if (!this.isOpen(box)) throw new ConflictException('Buy Box bidding is closed');
    const offer: any = box.offers.find((item: any) => item.vendorId === user.tenantId && item.status === BuyBoxOfferStatus.ACTIVE);
    if (!offer) throw new ForbiddenException('Your product is not assigned to this Buy Box');
    if (!this.productState(offer.product).eligible) throw new ConflictException('Your product is not eligible to bid');
    const amount = Number(dto.amount); const minimum = Number(box.minimumBidAmount || 0); const increment = Number(box.minimumBidIncrement || 0);
    const activeBids = box.offers.flatMap((item: any) => item.bids.map((bid: any) => this.currentBid({ bids: [bid] }))).filter(Boolean);
    const highest = Math.max(0, ...activeBids.map((bid: any) => Number(bid.amount)));
    const currentOwn = this.currentBid(offer);
    const required = Math.max(minimum, highest > 0 && (!currentOwn || highest !== Number(currentOwn.amount)) ? highest + increment : Number(currentOwn?.amount || 0) + (currentOwn ? increment : 0));
    if (!Number.isFinite(amount) || amount < required) throw new ConflictException(`Bid must be at least ${required.toFixed(2)} ${box.currency}`);
    const bid = await this.prisma.$transaction(async (tx) => { await tx.buyBoxBid.updateMany({ where: { buyBoxOfferId: offer.id, status: BuyBoxBidStatus.ACTIVE }, data: { status: BuyBoxBidStatus.OUTBID } }); return tx.buyBoxBid.create({ data: { id: randomUUID(), buyBoxOfferId: offer.id, vendorId: user.tenantId as string, amount, currency: box.currency, startsAt: dto.startsAt ? new Date(dto.startsAt) : null, endsAt: dto.endsAt ? new Date(dto.endsAt) : box.endsAt } }); });
    await this.audit.write(this.prisma, { actor: user, action: 'BUY_BOX_BID_SUBMITTED', entityType: 'BuyBoxBid', entityId: bid.id, afterState: { buyBoxId: boxId, vendorId: user.tenantId, amount, currency: box.currency } });
    return this.vendorDetail(user, boxId);
  }

  activeBidAmount(master: any, productId: string, now = new Date()) {
    const box = master?.buyBox; if (!this.isOpen(box, now)) return null;
    const offer = box.offers?.find((item: any) => item.productId === productId && item.status === BuyBoxOfferStatus.ACTIVE);
    const bid = offer ? this.currentBid(offer, now) : null;
    return bid ? Number(bid.amount) : null;
  }

  shouldShowAll(master: any) { return master?.buyBox?.status === BuyBoxStatus.OPEN ? master.buyBox.displayMode === ExperienceDisplayMode.ALL_OFFERS : master?.displayMode === ExperienceDisplayMode.ALL_OFFERS; }
  selectionPolicy(master: any) { return master?.buyBox?.status === BuyBoxStatus.OPEN ? master.buyBox.selectionPolicy : null; }
}
