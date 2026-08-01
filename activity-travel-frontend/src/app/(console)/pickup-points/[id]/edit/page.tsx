import { ResourceEdit } from "@/features/common/ResourceDetails";
export default async function PickupEditPage({ params }: { params: Promise<{ id: string }> }) { return <ResourceEdit endpoint="pickup-points" title="Pickup point" id={(await params).id} />; }
