"use client";
import { use, useEffect, useState } from "react";
import { getCatalog } from "@/services/catalogService";
import type { CatalogRecord } from "@/services/catalogService";
import { CatalogForm } from "@/features/catalog/CatalogForm";
export default function CategoryEditPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); const [record, setRecord] = useState<CatalogRecord | null>(null); const [error, setError] = useState(""); useEffect(() => { void getCatalog("categories", id).then(setRecord).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load category")); }, [id]); if (error) return <div className="notice error">{error}</div>; return record ? <CatalogForm kind="categories" mode="edit" id={id} initial={record} /> : <div className="page-loading">Loading category…</div>; }
