"use client";

import { use, useEffect, useState } from "react";
import { getBooking, type BookingRecord } from "@/services/bookingService";
import { BookingEdit } from "@/features/bookings/BookingEdit";

export default function BookingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const [booking, setBooking] = useState<BookingRecord | null>(null); const [error, setError] = useState("");
  useEffect(() => { void getBooking(id).then(setBooking).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load booking")); }, [id]);
  if (error) return <div className="notice error" role="alert">{error}</div>;
  return booking ? <BookingEdit booking={booking} /> : <div className="page-loading">Loading booking...</div>;
}
