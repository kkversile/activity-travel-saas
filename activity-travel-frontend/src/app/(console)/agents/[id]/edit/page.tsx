import { PartnerForm } from "@/features/partners/PartnerForm";
export default async function EditAgentPage({ params }: { params: Promise<{ id: string }> }) { return <div><div className="page-heading"><div><p className="eyebrow">PARTNERS</p><h2>Edit Agent</h2></div></div><PartnerForm kind="agents" id={(await params).id} /></div>; }
