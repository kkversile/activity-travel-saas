"use client";
import { use, useEffect, useState } from "react";
import { getSchedule } from "@/services/inventoryService";
import type { ScheduleRecord } from "@/services/inventoryService";
import { ScheduleDetails } from "@/features/inventory/ScheduleDetails";
export default function ScheduleDetailsPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); const [record, setRecord] = useState<ScheduleRecord | null>(null); const [error, setError] = useState(""); useEffect(() => { void getSchedule(id).then(setRecord).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load schedule")); }, [id]); if (error) return <div className="notice error">{error}</div>; return record ? <ScheduleDetails schedule={record} /> : <div className="page-loading">Loading schedule…</div>; }
