import { ResourceEdit } from "@/features/common/ResourceDetails";
export default async function VariantEditPage({ params }: { params: Promise<{ id: string }> }) { return <ResourceEdit endpoint="variants" title="Activity variant" id={(await params).id} />; }
