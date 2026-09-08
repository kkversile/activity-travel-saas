import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  private voucherPdf(lines: string[]) {
    const escape = (value: string) => value.replace(/([\\()])/g, '\\$1');
    const text = lines.map((line, index) => `BT /F1 ${index === 0 ? 18 : 11} Tf 50 ${750 - index * 28} Td (${escape(line)}) Tj ET`).join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${Buffer.byteLength(text, 'utf8')} >>\nstream\n${text}\nendstream`,
    ];
    const chunks = ['%PDF-1.4\n'];
    const offsets = [0];
    for (let i = 0; i < objects.length; i += 1) { offsets.push(Buffer.byteLength(chunks.join(''), 'utf8')); chunks.push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`); }
    const xref = Buffer.byteLength(chunks.join(''), 'utf8');
    chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return Buffer.from(chunks.join(''), 'utf8');
  }

  async list(user: AuthUser, status?: BookingStatus) {
    const tenantId = requireTenant(user);
    const rows = await this.prisma.booking.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: { activity: { select: { productName: true } }, ratePlan: { select: { name: true } } },
      orderBy: [{ serviceDate: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((b) => ({ ...b, amount: Number(b.amount) }));
  }

  async confirm(user: AuthUser, id: string) {
    const tenantId = requireTenant(user);
    const changed = await this.prisma.booking.updateMany({
      where: { id, tenantId, status: BookingStatus.PENDING },
      data: { status: BookingStatus.CONFIRMED, version: { increment: 1 } },
    });
    if (changed.count !== 1) {
      const exists = await this.prisma.booking.findFirst({ where: { id, tenantId } });
      if (!exists) throw new NotFoundException('Booking not found');
      throw new ConflictException(`Booking cannot be confirmed from ${exists.status}`);
    }
    return this.prisma.booking.findUnique({ where: { id } });
  }

  async cancel(user: AuthUser, id: string) {
    const tenantId = requireTenant(user);
    const changed = await this.prisma.booking.updateMany({
      where: { id, tenantId, status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] } },
      data: { status: BookingStatus.CANCELLED, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ConflictException('Booking cannot be cancelled');
    return this.prisma.booking.findUnique({ where: { id } });
  }

  async voucher(user: AuthUser, id: string) {
    const tenantId = requireTenant(user);
    const booking = await this.prisma.booking.findFirst({ where: { id, tenantId }, include: { activity: { select: { productName: true, address: true } }, ratePlan: { select: { name: true, pickupInput: true } } } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (!([BookingStatus.CONFIRMED, BookingStatus.COMPLETED] as BookingStatus[]).includes(booking.status)) throw new ConflictException('Voucher is available only for confirmed bookings');
    const voucherCode = `VCH-${booking.bookingCode}`;
    const pdf = this.voucherPdf([
      'VOYA BOOKING VOUCHER',
      `Voucher: ${voucherCode}`,
      `Booking ID: ${booking.bookingCode}`,
      `Activity: ${booking.activity.productName}`,
      `Rate plan: ${booking.ratePlan?.name || 'Standard'}`,
      `Service date: ${new Date(booking.serviceDate).toLocaleDateString('en-IN')}`,
      `Travellers: ${booking.pax}`,
      `Amount: INR ${Number(booking.amount).toFixed(2)}`,
      `Meeting point: ${booking.activity.address || booking.ratePlan?.pickupInput || 'As confirmed with the vendor'}`,
      'Status: CONFIRMED',
    ]);
    const uploadDir = join(process.cwd(), 'public/uploads');
    await mkdir(uploadDir, { recursive: true });
    const fileName = `voucher-${booking.bookingCode}.pdf`;
    await writeFile(join(uploadDir, fileName), pdf);
    return { voucherCode, fileUrl: `/api/uploads/${fileName}`, booking };
  }
}
