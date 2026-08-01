"use client";
import { use, useEffect, useState } from "react";
import { getCatalog } from "@/services/catalogService";
import type { CatalogRecord } from "@/services/catalogService";
import { CatalogDetails } from "@/features/catalog/CatalogDetails";
export default function CategoryDetailsPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); const [record, setRecord] = useState<CatalogRecord | null>(null); const [error, setError] = useState(""); useEffect(() => { void getCatalog("categories", id).then(setRecord).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load category")); }, [id]); if (error) return <div className="notice error">{error}</div>; return record ? <CatalogDetails kind="categories" record={record} /> : <div className="page-loading">Loading category…</div>; }
