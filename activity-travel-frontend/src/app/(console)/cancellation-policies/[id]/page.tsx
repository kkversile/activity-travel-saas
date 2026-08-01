import { ResourceDetails } from "@/features/common/ResourceDetails";
export default async function PolicyDetailsPage({ params }: { params: Promise<{ id: string }> }) { return <ResourceDetails endpoint="cancellation-policies" title="Cancellation policy" id={(await params).id} />; }
