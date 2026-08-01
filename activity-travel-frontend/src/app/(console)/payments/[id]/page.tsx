import { FinanceDetails } from "@/features/finance/FinanceDetails";
export default async function PaymentDetailsPage({ params }: { params: Promise<{ id: string }> }) { return <FinanceDetails kind="payments" id={(await params).id} />; }
