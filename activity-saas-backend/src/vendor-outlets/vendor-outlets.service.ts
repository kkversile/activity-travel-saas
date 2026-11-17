import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BankAccountVerificationStatus, VendorOutletStatus } from '@prisma/client';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { encryptSecret, maskAccountNumber } from '../common/secret-crypto';
import { PrismaService } from '../prisma/prisma.service';
import { VendorOutletAccessService } from './vendor-outlet-access.service';

export class CreateVendorOutletDto {
  @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/) outletCode!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsEmail() @MaxLength(254) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(32) contactPhone?: string;
}

export class UpdateVendorOutletDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string | null;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string | null;
  @IsOptional() @IsEmail() @MaxLength(254) contactEmail?: string | null;
  @IsOptional() @IsString() @MaxLength(32) contactPhone?: string | null;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: VendorOutletStatus;
}

export class CreateVendorBankAccountDto {
  @IsString() @MinLength(6) @MaxLength(34) @Matches(/^[A-Za-z0-9 -]+$/) accountNumber!: string;
  @IsString() @MinLength(2) @MaxLength(120) bankName!: string;
  @IsString() @Matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/) ifsc!: string;
  @IsString() @MinLength(2) @MaxLength(120) accountHolder!: string;
  @IsString() @IsIn(['SAVINGS', 'CURRENT', 'OTHER']) accountType!: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() proofDocumentId?: string;
}

export class SetOutletMemberDto {
  @IsBoolean() active!: boolean;
}

export class AssignOutletBankDto {
  @IsOptional() @IsString() bankAccountId?: string | null;
}

export class ReviewVendorBankAccountDto {
  @IsIn(['VERIFIED', 'REJECTED']) status!: 'VERIFIED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@Injectable()
export class VendorOutletsService {
  constructor(private readonly prisma: PrismaService, private readonly access: VendorOutletAccessService) {}

  list(user: AuthUser) { return this.access.list(user); }

  async create(user: AuthUser, input: CreateVendorOutletDto) {
    const tenantId = await this.access.requireOwner(user);
    try {
      const outlet = await this.prisma.vendorOutlet.create({ data: { tenantId, outletCode: input.outletCode.trim().toUpperCase(), name: input.name.trim(), location: input.location?.trim() || null, contactName: input.contactName?.trim() || null, contactEmail: input.contactEmail?.trim().toLowerCase() || null, contactPhone: input.contactPhone?.trim() || null } });
      await this.audit(user, tenantId, 'VENDOR_OUTLET_CREATED', 'VendorOutlet', outlet.id, null, { outletCode: outlet.outletCode, name: outlet.name, status: outlet.status });
      return outlet;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('That outlet code already exists in this vendor workspace.');
      throw error;
    }
  }

  async update(user: AuthUser, id: string, input: UpdateVendorOutletDto) {
    const tenantId = await this.access.requireOwner(user);
    return this.prisma.$transaction(async (tx) => {
      // Serialize lifecycle changes, including concurrent last-outlet deactivation.
      await tx.$queryRawUnsafe('SELECT "id" FROM "Tenant" WHERE "id" = $1 FOR UPDATE', tenantId);
      const current = await tx.vendorOutlet.findFirst({ where: { id, tenantId } });
      if (!current) throw new NotFoundException('Outlet not found.');
      const data = {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.location !== undefined ? { location: input.location?.trim() || null } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName?.trim() || null } : {}),
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail?.trim().toLowerCase() || null } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone?.trim() || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      };
      if (input.status === 'INACTIVE' && current.status !== 'INACTIVE') {
        const replacement = await tx.vendorOutlet.findFirst({ where: { tenantId, id: { not: id }, status: 'ACTIVE' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        if (!replacement) throw new ConflictException('Keep at least one outlet active for this vendor workspace.');
        if (current.isDefault) {
          await tx.vendorOutlet.update({ where: { id }, data: { isDefault: false } });
          await tx.vendorOutlet.update({ where: { id: replacement.id }, data: { isDefault: true } });
        }
      }
      const updated = await tx.vendorOutlet.update({ where: { id }, data });
      await tx.auditLog.create({ data: { tenantId, actorId: user.sub, actorRole: user.role, action: 'VENDOR_OUTLET_UPDATED', entityType: 'VendorOutlet', entityId: id, beforeState: { name: current.name, status: current.status }, afterState: { name: updated.name, status: updated.status } } });
      return updated;
    });
  }

  async bankAccounts(user: AuthUser) {
    const tenantId = await this.access.requireOwner(user);
    const items = await this.prisma.vendorBankAccount.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, select: { id: true, accountNumberMasked: true, bankName: true, ifsc: true, accountHolder: true, accountType: true, currency: true, verificationStatus: true, proofDocumentId: true, verificationNote: true, verifiedAt: true, active: true, createdAt: true, updatedAt: true } });
    return { items };
  }

  async createBankAccount(user: AuthUser, input: CreateVendorBankAccountDto) {
    const tenantId = await this.access.requireOwner(user);
    if (input.proofDocumentId) {
      const proof = await this.prisma.fileAsset.findFirst({ where: { id: input.proofDocumentId, tenantId, archivedAt: null }, select: { id: true } });
      if (!proof) throw new BadRequestException('Bank proof must be an active document uploaded to this vendor workspace.');
    }
    const normalizedNumber = input.accountNumber.replace(/[\s-]/g, '');
    if (!/^[A-Za-z0-9]{6,34}$/.test(normalizedNumber)) throw new BadRequestException('Enter a valid account number.');
    const account = await this.prisma.vendorBankAccount.create({
      data: {
        tenantId,
        accountNumberCiphertext: encryptSecret(normalizedNumber),
        accountNumberMasked: maskAccountNumber(normalizedNumber),
        bankName: input.bankName.trim(),
        ifsc: input.ifsc.trim().toUpperCase(),
        accountHolder: input.accountHolder.trim(),
        accountType: input.accountType,
        currency: input.currency || 'INR',
        proofDocumentId: input.proofDocumentId || null,
        // New accounts remain pending until an authorized admin verifies evidence.
        verificationStatus: BankAccountVerificationStatus.PENDING,
      },
      select: { id: true, accountNumberMasked: true, bankName: true, ifsc: true, accountHolder: true, accountType: true, currency: true, verificationStatus: true, active: true, createdAt: true },
    });
    await this.audit(user, tenantId, 'VENDOR_BANK_ACCOUNT_ADDED', 'VendorBankAccount', account.id, null, { accountNumberMasked: account.accountNumberMasked, bankName: account.bankName, ifsc: account.ifsc, verificationStatus: account.verificationStatus });
    return account;
  }

  async assignBank(user: AuthUser, outletId: string, input: AssignOutletBankDto) {
    const tenantId = await this.access.requireOwner(user);
    const outlet = await this.prisma.vendorOutlet.findFirst({ where: { id: outletId, tenantId } });
    if (!outlet) throw new NotFoundException('Outlet not found.');
    if (input.bankAccountId) {
      const account = await this.prisma.vendorBankAccount.findFirst({ where: { id: input.bankAccountId, tenantId, active: true, verificationStatus: BankAccountVerificationStatus.VERIFIED }, select: { id: true } });
      if (!account) throw new BadRequestException('Choose an active, verified bank account belonging to this vendor.');
    }
    const updated = await this.prisma.vendorOutlet.update({ where: { id: outletId }, data: { bankAccountId: input.bankAccountId || null }, include: { bankAccount: { select: { id: true, accountNumberMasked: true, bankName: true, verificationStatus: true } } } });
    await this.audit(user, tenantId, 'VENDOR_OUTLET_BANK_CHANGED', 'VendorOutlet', outletId, { bankAccountId: outlet.bankAccountId }, { bankAccountId: updated.bankAccountId });
    return updated;
  }

  async reviewBankAccount(actor: AuthUser, id: string, input: ReviewVendorBankAccountDto) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') throw new NotFoundException('Bank account not found.');
    const account = await this.prisma.vendorBankAccount.findUnique({ where: { id }, select: { id: true, tenantId: true, accountNumberMasked: true, bankName: true, ifsc: true, proofDocumentId: true, verificationStatus: true, active: true } });
    if (!account) throw new NotFoundException('Bank account not found.');
    if (input.status === 'VERIFIED') {
      if (!input.note?.trim() || !account.proofDocumentId) throw new BadRequestException('Review bank evidence and provide a verification note.');
      const proof = await this.prisma.fileAsset.findFirst({ where: { id: account.proofDocumentId, tenantId: account.tenantId, archivedAt: null, purpose: 'VENDOR_DOCUMENT' }, select: { id: true } });
      if (!proof) throw new BadRequestException('A current bank proof document is required.');
    }
    if (input.status === 'REJECTED' && !input.note?.trim()) throw new BadRequestException('Provide a reason when rejecting bank verification.');
    const updated = await this.prisma.vendorBankAccount.update({
      where: { id },
      data: { verificationStatus: input.status, verificationNote: input.note?.trim() || null, verifiedAt: input.status === 'VERIFIED' ? new Date() : null, verifiedById: input.status === 'VERIFIED' ? actor.sub : null },
      select: { id: true, tenantId: true, accountNumberMasked: true, bankName: true, ifsc: true, verificationStatus: true, verificationNote: true, verifiedAt: true, active: true },
    });
    await this.prisma.auditLog.create({ data: { tenantId: account.tenantId, actorId: actor.sub, actorRole: actor.role, action: `VENDOR_BANK_ACCOUNT_${input.status}`, entityType: 'VendorBankAccount', entityId: id, beforeState: { verificationStatus: account.verificationStatus }, afterState: { verificationStatus: updated.verificationStatus, note: updated.verificationNote, accountNumberMasked: updated.accountNumberMasked, bankName: updated.bankName, ifsc: updated.ifsc } } });
    return updated;
  }

  adminOutlets(tenantId: string) {
    return this.prisma.vendorOutlet.findMany({ where: { tenantId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true, outletCode: true, status: true, bankAccountId: true, bankAccount: { select: { id: true, bankName: true, accountNumberMasked: true, verificationStatus: true } } } });
  }

  async pendingBankReviews() {
    return this.prisma.vendorBankAccount.findMany({
      where: { verificationStatus: 'PENDING', active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, tenantId: true, bankName: true, accountHolder: true, accountNumberMasked: true, ifsc: true, accountType: true, currency: true, proofDocumentId: true, verificationStatus: true, createdAt: true, tenant: { select: { name: true } } },
    });
  }

  async setMemberAccess(user: AuthUser, outletId: string, memberId: string, active: boolean) {
    const tenantId = await this.access.requireOwner(user);
    const [outlet, member] = await Promise.all([
      this.prisma.vendorOutlet.findFirst({ where: { id: outletId, tenantId }, select: { id: true } }),
      this.prisma.user.findFirst({ where: { id: memberId, tenantId, role: 'VENDOR', organizationRole: { not: 'OWNER' } }, select: { id: true, organizationRole: true } }),
    ]);
    if (!outlet || !member) throw new NotFoundException('Outlet or non-owner team member not found in this vendor workspace.');
    const result = await this.prisma.userOutletAccess.upsert({ where: { userId_outletId: { userId: memberId, outletId } }, create: { tenantId, userId: memberId, outletId, active }, update: { active } });
    await this.audit(user, tenantId, active ? 'VENDOR_OUTLET_ACCESS_GRANTED' : 'VENDOR_OUTLET_ACCESS_REVOKED', 'UserOutletAccess', result.id, null, { userId: memberId, outletId, active });
    return { userId: memberId, outletId, active: result.active };
  }

  private audit(user: AuthUser, tenantId: string, action: string, entityType: string, entityId: string, beforeState: unknown, afterState: unknown) {
    return this.prisma.auditLog.create({ data: { tenantId, actorId: user.sub, actorRole: user.role, action, entityType, entityId, beforeState: beforeState as any, afterState: afterState as any } });
  }
}
