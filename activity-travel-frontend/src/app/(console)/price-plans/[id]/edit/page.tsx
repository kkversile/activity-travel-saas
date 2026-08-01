import { ResourceEdit } from "@/features/common/ResourceDetails";
export default async function PricePlanEditPage({ params }: { params: Promise<{ id: string }> }) { return <ResourceEdit endpoint="price-plans" title="Price plan" id={(await params).id} />; }
