import { PartnerDetails } from "@/features/partners/PartnerDetails";
export default async function SupplierDetailsPage({ params }: { params: Promise<{ id: string }> }) { return <PartnerDetails kind="suppliers" id={(await params).id} />; }
