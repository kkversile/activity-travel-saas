"use client";
import { use, useEffect, useState } from "react";
import { getBooking } from "@/services/bookingService";
import type { BookingRecord } from "@/services/bookingService";
import { BookingDetails } from "@/features/bookings/BookingDetails";
export default function BookingDetailsPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); const [record, setRecord] = useState<BookingRecord | null>(null); const [error, setError] = useState(""); useEffect(() => { void getBooking(id).then(setRecord).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load booking")); }, [id]); if (error) return <div className="notice error">{error}</div>; return record ? <BookingDetails booking={record} /> : <div className="page-loading">Loading booking…</div>; }
