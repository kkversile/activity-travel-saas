"use client";
import { use, useEffect, useState } from "react";
import { getCatalog } from "@/services/catalogService";
import type { CatalogRecord } from "@/services/catalogService";
import { CatalogDetails } from "@/features/catalog/CatalogDetails";
export default function DestinationDetailsPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); const [record, setRecord] = useState<CatalogRecord | null>(null); const [error, setError] = useState(""); useEffect(() => { void getCatalog("destinations", id).then(setRecord).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load destination")); }, [id]); if (error) return <div className="notice error">{error}</div>; return record ? <CatalogDetails kind="destinations" record={record} /> : <div className="page-loading">Loading destination…</div>; }
