import { ResourceDetails } from "@/features/common/ResourceDetails";
export default async function VariantDetailsPage({ params }: { params: Promise<{ id: string }> }) { return <ResourceDetails endpoint="variants" title="Activity variant" id={(await params).id} />; }
