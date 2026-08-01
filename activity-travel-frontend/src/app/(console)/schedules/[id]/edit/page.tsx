import { ResourceEdit } from "@/features/common/ResourceDetails";
export default async function ScheduleEditPage({ params }: { params: Promise<{ id: string }> }) { return <ResourceEdit endpoint="schedules" title="Schedule" id={(await params).id} />; }
