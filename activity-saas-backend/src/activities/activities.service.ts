import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityStatus, Prisma, UserRole } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { AuthUser } from '../common/auth.types';
import { isPlatformRole, requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityMediaDto, ActivityMediaUploadDto, ActivityQueryDto, CreateActivityDto, UpdateActivityDto } from './activity.dto';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantWhere(user: AuthUser): Prisma.ActivityWhereInput {
    return isPlatformRole(user) ? {} : { tenantId: requireTenant(user) };
  }

  list(user: AuthUser, query: ActivityQueryDto) {
    return this.prisma.activity.findMany({
      where: {
        ...this.tenantWhere(user),
        ...(query.status ? { status: query.status } : {}),
        ...(query.search ? { productName: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: { ratePlans: { select: { id: true, ratePlanCode: true, name: true, status: true, basePrice: true } } },
      orderBy: [{ rank: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async get(user: AuthUser, id: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, ...this.tenantWhere(user) },
      include: { media: true, ratePlans: { include: { travellerRules: true, cancellationRules: true } } },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  create(user: AuthUser, dto: CreateActivityDto) {
    const tenantId = requireTenant(user);
    const { faqs, sourcePayload, ...rest } = dto;
    return this.prisma.activity.create({
      data: {
        ...rest,
        tenantId,
        status: ActivityStatus.DRAFT,
        ...(faqs ? { faqs: faqs as Prisma.InputJsonValue } : {}),
        ...(sourcePayload ? { sourcePayload: sourcePayload as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateActivityDto) {
    const existing = await this.get(user, id);
    const { faqs, sourcePayload, ...rest } = dto;
    const data: Prisma.ActivityUpdateInput = {
      ...rest,
      ...(faqs ? { faqs: faqs as Prisma.InputJsonValue } : {}),
      ...(sourcePayload ? { sourcePayload: sourcePayload as Prisma.InputJsonValue } : {}),
    };
    if (existing.status === ActivityStatus.LIVE && user.role === UserRole.VENDOR) {
      // Live listings can be edited, but edits move back to review to avoid unreviewed production changes.
      data.status = ActivityStatus.UNDER_REVIEW;
    }
    return this.prisma.activity.update({ where: { id }, data });
  }

  async addMedia(user: AuthUser, id: string, dto: ActivityMediaDto) {
    await this.get(user, id);
    return this.prisma.activityMedia.create({ data: { activityId: id, ...dto } });
  }

  async uploadMedia(user: AuthUser, id: string, dto: ActivityMediaUploadDto) {
    await this.get(user, id);
    const match = dto.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new ConflictException('Media must be a base64 data URL');
    const safeName = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
    const extension = extname(safeName) || (match[1].includes('png') ? '.png' : match[1].includes('jpeg') ? '.jpg' : '.bin');
    const storedName = `activity-${id}-${Date.now()}${extension}`;
    const uploadDir = join(process.cwd(), 'public/uploads');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, storedName), Buffer.from(match[2], 'base64'));
    return this.prisma.activityMedia.create({ data: { activityId: id, kind: dto.kind, url: `/api/uploads/${storedName}`, description: dto.description, rank: dto.rank || 1 } });
  }

  async removeMedia(user: AuthUser, id: string, mediaId: string) {
    await this.get(user, id);
    const media = await this.prisma.activityMedia.findFirst({ where: { id: mediaId, activityId: id } });
    if (!media) throw new NotFoundException('Media not found');
    await this.prisma.activityMedia.delete({ where: { id: mediaId } });
    return { deleted: true };
  }

  async submit(user: AuthUser, id: string) {
    const existing = await this.get(user, id);
    const submittableStatuses: ActivityStatus[] = [ActivityStatus.DRAFT, ActivityStatus.INACTIVE];
    if (!submittableStatuses.includes(existing.status)) {
      throw new ConflictException(`Cannot submit activity from ${existing.status}`);
    }
    return this.prisma.activity.update({ where: { id }, data: { status: ActivityStatus.UNDER_REVIEW } });
  }

  async publish(user: AuthUser, id: string) {
    const existing = await this.get(user, id);
    if (!isPlatformRole(user) && !([ActivityStatus.DRAFT, ActivityStatus.INACTIVE, ActivityStatus.UNDER_REVIEW] as ActivityStatus[]).includes(existing.status)) {
      throw new ConflictException(`Cannot publish activity from ${existing.status}`);
    }
    if (isPlatformRole(user) && existing.status !== ActivityStatus.UNDER_REVIEW) {
      throw new ConflictException('Only reviewed activities can be published');
    }
    return this.prisma.activity.update({ where: { id }, data: { status: ActivityStatus.LIVE } });
  }
}
