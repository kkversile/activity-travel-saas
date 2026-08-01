"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getCustomer, type CustomerRecord } from "@/services/customerService";

const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;

export default function CustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const [record, setRecord] = useState<CustomerRecord | null>(null); const [error, setError] = useState("");
  useEffect(() => { void getCustomer(id).then(setRecord).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load customer")); }, [id]);
  if (error) return <div className="notice error" role="alert">{error}</div>;
  if (!record) return <div className="page-loading">Loading customer…</div>;
  const bookings = record.bookings ?? [];
  const passengers = bookings.flatMap((booking) => booking.passengers.map((passenger) => ({ ...passenger, reference: booking.reference })));
  const payments = bookings.flatMap((booking) => booking.payments.map((payment) => ({ ...payment, reference: booking.reference })));
  return <div><div className="page-heading"><div><p className="eyebrow">BOOKINGS / CUSTOMERS</p><h2>{record.name}</h2><p className="subtext">{record.email} · {record.phone ?? "No phone"}</p></div><Link className="primary button-link" href={`/customers/${record.id}/edit`}>Edit customer</Link></div><section className="panel detail-grid"><div><span>Email</span><strong>{record.email}</strong></div><div><span>Phone</span><strong>{record.phone ?? "—"}</strong></div><div><span>Country</span><strong>{record.country ?? "—"}</strong></div><div><span>Status</span><strong>{record.status ?? "ACTIVE"}</strong></div><div><span>Total spent</span><strong>{money(record.totalSpentMinor ?? 0, "INR")}</strong></div><div><span>Last booking</span><strong>{record.lastBookingAt ? new Date(record.lastBookingAt).toLocaleString() : "—"}</strong></div></section><section className="panel"><h3>Notes</h3><p>{record.notes || "No customer notes recorded."}</p></section><section className="panel"><h3>Bookings</h3>{bookings.length ? bookings.map((booking) => <div className="activity-row" key={booking.id}><Link href={`/bookings/${booking.id}`}><strong>{booking.reference}</strong></Link><span>{booking.activity.name} · {booking.status} · {money(booking.totalMinor, booking.currency)} · {new Date(booking.createdAt).toLocaleDateString()}</span></div>) : <p>No bookings recorded.</p>}</section><section className="panel"><h3>Passengers</h3>{passengers.length ? passengers.map((passenger) => <div className="activity-row" key={passenger.id}><strong>{passenger.firstName} {passenger.lastName}</strong><span>{passenger.type} · booking {passenger.reference}</span></div>) : <p>No passengers recorded.</p>}</section><section className="panel"><h3>Payment history</h3>{payments.length ? payments.map((payment) => <div className="activity-row" key={payment.id}><strong>{payment.reference}</strong><span>{payment.status} · {money(payment.amountMinor, payment.currency)} · refunds {payment.refunds.length}</span></div>) : <p>No payments recorded.</p>}</section></div>;
}
