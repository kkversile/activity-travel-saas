import { ResourceDetails } from "@/features/common/ResourceDetails";
export default async function VoucherDetailsPage({ params }: { params: Promise<{ id: string }> }) { return <ResourceDetails endpoint="vouchers" title="Voucher" id={(await params).id} />; }
