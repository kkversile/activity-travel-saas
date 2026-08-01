import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InvoiceStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreateInvoiceDto, InvoiceQueryDto } from "./dto/invoice.dto";

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, q: InvoiceQueryDto) {
    const p = parsePaginationQuery(q, ["createdAt", "invoiceNumber", "totalMinor", "status"], "createdAt");
    const where = { tenantId, ...(q.status ? { status: q.status } : {}), ...(p.search ? { OR: [{ invoiceNumber: { contains: p.search, mode: "insensitive" as const } }, { booking: { reference: { contains: p.search, mode: "insensitive" as const } } }, { booking: { customerName: { contains: p.search, mode: "insensitive" as const } } }] } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, include: { booking: { select: { reference: true, customerName: true } } }, orderBy: { [p.sortBy]: p.sortOrder }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
      this.prisma.invoice.count({ where })
    ]);
    return paginated(data, p.page, p.pageSize, total);
  }

  async get(tenantId: string, id: string) {
    const item = await this.prisma.invoice.findFirst({ where: { id, tenantId }, include: { booking: true } });
    if (!item) throw new NotFoundException("Invoice not found");
    return item;
  }

  async create(tenantId: string, d: CreateInvoiceDto) {
    const booking = await this.prisma.booking.findFirst({ where: { id: d.bookingId, tenantId }, select: { id: true, currency: true } });
    if (!booking) throw new NotFoundException("Booking not found");
    if (d.currency.toUpperCase() !== booking.currency.toUpperCase()) throw new ConflictException("Invoice currency does not match booking currency");
    if (d.totalMinor !== d.subtotalMinor + d.taxMinor) throw new ConflictException("Invoice total must equal subtotal plus tax");
    const invoice = await this.prisma.invoice.create({ data: { tenantId, bookingId: d.bookingId, invoiceNumber: d.invoiceNumber, subtotalMinor: d.subtotalMinor, taxMinor: d.taxMinor, totalMinor: d.totalMinor, currency: d.currency.toUpperCase() } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "INVOICE_CREATED", entityType: "Invoice", entityId: invoice.id, metadata: { invoiceNumber: invoice.invoiceNumber, bookingId: d.bookingId } } });
    return invoice;
  }

  async issue(tenantId: string, id: string) {
    const invoice = await this.get(tenantId, id);
    if (invoice.status !== InvoiceStatus.DRAFT) throw new ConflictException("Only draft invoices can be issued");
    const marked = await this.prisma.invoice.updateMany({ where: { id, tenantId, status: InvoiceStatus.DRAFT }, data: { status: InvoiceStatus.ISSUED, issueDate: new Date() } });
    if (marked.count !== 1) throw new ConflictException("Only draft invoices can be issued");
    const updated = await this.prisma.invoice.findUniqueOrThrow({ where: { id } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "INVOICE_ISSUED", entityType: "Invoice", entityId: id } });
    return updated;
  }

  async pdf(tenantId: string, id: string): Promise<Buffer> {
    const invoice = await this.get(tenantId, id);
    const safe = (value: string) => value.replace(/[()\\]/g, "\\$&");
    const lines = [
      `Invoice ${invoice.invoiceNumber}`,
      `Booking ${invoice.booking.reference}`,
      `Customer ${invoice.booking.customerName}`,
      `Subtotal ${invoice.currency} ${(invoice.subtotalMinor / 100).toFixed(2)}`,
      `Tax ${invoice.currency} ${(invoice.taxMinor / 100).toFixed(2)}`,
      `Total ${invoice.currency} ${(invoice.totalMinor / 100).toFixed(2)}`
    ];
    const content = ["BT", "/F1 14 Tf", "50 760 Td", ...lines.flatMap((line, index) => [index ? "0 -24 Td" : "", `(${safe(line)}) Tj`]), "ET"].filter(Boolean).join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
    ];
    let pdf = "%PDF-1.4\n"; const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) { offsets.push(Buffer.byteLength(pdf, "utf8")); pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; }
    const xref = Buffer.byteLength(pdf, "utf8"); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf, "utf8");
  }
}
