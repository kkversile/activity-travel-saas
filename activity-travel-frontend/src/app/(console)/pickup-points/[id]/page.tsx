import { ResourceDetails } from "@/features/common/ResourceDetails";
export default async function PickupDetailsPage({ params }: { params: Promise<{ id: string }> }) { return <ResourceDetails endpoint="pickup-points" title="Pickup point" id={(await params).id} />; }
