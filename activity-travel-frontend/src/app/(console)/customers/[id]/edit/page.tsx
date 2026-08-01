"use client";
import { use, useEffect, useState } from "react";
import { getCustomer, type CustomerRecord } from "@/services/customerService";
import { CustomerForm } from "@/features/customers/CustomerForm";
export default function CustomerEditPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); const [record, setRecord] = useState<CustomerRecord | null>(null); const [error, setError] = useState(""); useEffect(() => { void getCustomer(id).then(setRecord).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load customer")); }, [id]); if (error) return <div className="notice error">{error}</div>; return record ? <CustomerForm id={id} initial={record} /> : <div className="page-loading">Loading customer…</div>; }
