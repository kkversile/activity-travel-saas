import { PassengerForm } from "@/features/passengers/PassengerForm";
export default async function EditPassengerPage({ params }: { params: Promise<{ id: string }> }) { return <PassengerForm id={(await params).id} />; }
