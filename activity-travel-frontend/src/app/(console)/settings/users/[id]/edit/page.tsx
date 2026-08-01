"use client";
import { use, useEffect, useState } from "react";
import { listUsers } from "@/services/userService";
import { UserForm } from "@/features/users/UserForm";
export default function EditUserPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); const [user, setUser] = useState<{ displayName: string; role: string; customRoleId?: string | null } | null>(null); const [error, setError] = useState(""); useEffect(() => { void listUsers().then((result) => { const item = result.data.find((row) => row.user.id === id); if (item) setUser({ displayName: item.user.displayName, role: item.role, customRoleId: item.customRoleId }); else setError("User not found"); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load user")); }, [id]); if (error) return <div className="notice error">{error}</div>; return user ? <UserForm id={id} initial={user} /> : <div className="page-loading">Loading user…</div>; }
