import { PassengerDetails } from "@/features/passengers/PassengerDetails";
export default async function PassengerDetailsPage({ params }: { params: Promise<{ id: string }> }) { return <PassengerDetails id={(await params).id} />; }
