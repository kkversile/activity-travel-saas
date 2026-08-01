"use client";
import { useEffect, useState } from "react";
import { listBookings, type BookingRecord } from "@/services/bookingService";
import { DataTable } from "@/components/table/DataTable";
import { EmptyState, ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";
import Link from "next/link";

export function CancellationsList() {
  const [rows, setRows] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void listBookings("page=1&pageSize=25&status=CANCELLED")
      .then((result) => setRows(result.data))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load cancellations"))
      .finally(() => setLoading(false));
  }, []);

  return <div>
    <div className="page-heading"><div><p className="eyebrow">BOOKINGS</p><h2>Cancellations</h2><p className="subtext">Cancelled bookings and released capacity.</p></div></div>
    <section className="panel">
      {loading ? <LoadingTable /> : error ? <ErrorPanel message={error} onRetry={() => window.location.reload()} /> : rows.length === 0 ? <EmptyState title="No cancellations found" /> : <DataTable rows={rows} columns={[
        { key: "reference", label: "Reference", render: (row) => row.reference },
        { key: "customer", label: "Customer", render: (row) => row.customerName },
        { key: "activity", label: "Activity", render: (row) => row.activity.name },
        { key: "total", label: "Booking total", render: (row) => `${row.currency} ${(row.totalMinor / 100).toFixed(2)}` },
      ]} actions={(row) => <Link href={`/bookings/${row.id}`}>View</Link>} />}
    </section>
  </div>;
}
