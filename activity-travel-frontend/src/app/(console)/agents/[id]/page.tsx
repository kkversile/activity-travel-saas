import { PartnerDetails } from "@/features/partners/PartnerDetails";
export default async function AgentDetailsPage({ params }: { params: Promise<{ id: string }> }) { return <PartnerDetails kind="agents" id={(await params).id} />; }
