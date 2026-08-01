import { VoucherForm } from "@/features/vouchers/VoucherForm";
export default async function VoucherEditPage({ params }: { params: Promise<{ id: string }> }) { return <VoucherForm id={(await params).id} />; }
