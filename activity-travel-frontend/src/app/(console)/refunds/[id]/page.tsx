import { FinanceDetails } from "@/features/finance/FinanceDetails";
export default async function RefundDetailsPage({ params }: { params: Promise<{ id: string }> }) { return <FinanceDetails kind="refunds" id={(await params).id} />; }
