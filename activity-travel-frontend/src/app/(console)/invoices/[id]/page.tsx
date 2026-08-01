import { FinanceDetails } from "@/features/finance/FinanceDetails";
export default async function InvoiceDetailsPage({ params }: { params: Promise<{ id: string }> }) { return <FinanceDetails kind="invoices" id={(await params).id} />; }
