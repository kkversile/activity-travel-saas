import { ResourceEdit } from "@/features/common/ResourceDetails";
export default async function PolicyEditPage({ params }: { params: Promise<{ id: string }> }) { return <ResourceEdit endpoint="cancellation-policies" title="Cancellation policy" id={(await params).id} />; }
