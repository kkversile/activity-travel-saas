"use client";
import { use, useEffect, useState } from "react";
import { getPricePlan } from "@/services/inventoryService";
import type { PricePlanRecord } from "@/services/inventoryService";
import { PricePlanDetails } from "@/features/inventory/PricePlanDetails";
export default function PricePlanDetailsPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); const [record, setRecord] = useState<PricePlanRecord | null>(null); const [error, setError] = useState(""); useEffect(() => { void getPricePlan(id).then(setRecord).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load price plan")); }, [id]); if (error) return <div className="notice error">{error}</div>; return record ? <PricePlanDetails plan={record} /> : <div className="page-loading">Loading price plan…</div>; }
