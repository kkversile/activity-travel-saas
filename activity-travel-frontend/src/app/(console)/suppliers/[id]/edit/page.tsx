import { PartnerForm } from "@/features/partners/PartnerForm";
export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) { return <div><div className="page-heading"><div><p className="eyebrow">PARTNERS</p><h2>Edit Supplier</h2></div></div><PartnerForm kind="suppliers" id={(await params).id} /></div>; }
