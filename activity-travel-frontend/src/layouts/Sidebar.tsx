"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser } from "@/services/authService";
import { getAccessToken, getTenantId, setSession } from "@/services/apiClient";

const groups = [
  { label: "Workspace", items: [{ label: "Dashboard", href: "/dashboard" }] },
  { label: "Catalogue", items: [{ label: "Activities", href: "/activities" }, { label: "Categories", href: "/activity-categories" }, { label: "Destinations", href: "/destinations" }, { label: "Variants", href: "/activity-variants" }, { label: "Pickup Points", href: "/pickup-points" }, { label: "Cancellation Policies", href: "/cancellation-policies" }] },
  { label: "Inventory", items: [{ label: "Schedules", href: "/schedules" }, { label: "Availability", href: "/availability" }, { label: "Blackout Dates", href: "/blackout-dates" }] },
  { label: "Pricing", items: [{ label: "Price Plans", href: "/price-plans" }, { label: "Taxes", href: "/taxes" }, { label: "Discounts", href: "/discounts" }, { label: "Vouchers", href: "/vouchers" }, { label: "Agent Commissions", href: "/agent-commissions" }] },
  { label: "Bookings", items: [{ label: "All Bookings", href: "/bookings" }, { label: "New Booking", href: "/bookings/new" }, { label: "Customers", href: "/customers" }, { label: "Passengers", href: "/passengers" }, { label: "Cancellations", href: "/cancellations" }] },
  { label: "Partners", items: [{ label: "Suppliers", href: "/suppliers" }, { label: "Agents", href: "/agents" }] },
  { label: "Finance", items: [{ label: "Payments", href: "/payments" }, { label: "Refunds", href: "/refunds" }, { label: "Invoices", href: "/invoices" }] },
  { label: "Reports", items: [{ label: "Booking Report", href: "/reports/bookings" }, { label: "Revenue Report", href: "/reports/revenue" }, { label: "Capacity Report", href: "/reports/capacity" }, { label: "Activity Performance", href: "/reports/activities" }, { label: "Cancellations", href: "/reports/cancellations" }, { label: "Payments", href: "/reports/payments" }, { label: "Refunds", href: "/reports/refunds" }, { label: "Agents", href: "/reports/agents" }, { label: "Suppliers", href: "/reports/suppliers" }] },
  { label: "Administration", items: [{ label: "Users", href: "/settings/users" }, { label: "Roles & Permissions", href: "/settings/roles" }, { label: "Audit Logs", href: "/audit-logs" }, { label: "Settings", href: "/settings/general" }] }
];

export function Sidebar({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState(user.tenantId ?? "");
  const canAdmin = ["PARTNER_ADMIN", "PLATFORM_ADMIN"].includes(user.role);
  useEffect(() => { setCollapsed(window.localStorage.getItem("activity_sidebar_collapsed") === "true"); }, []);
  useEffect(() => { setSelectedTenantId(getTenantId() || user.tenantId || user.memberships[0]?.tenantId || ""); }, [user.memberships, user.tenantId]);
  const customRole = user.memberships.find((membership) => membership.tenantId === selectedTenantId)?.customRole;
  const canView = (href: string) => { if (!customRole || !customRole.isActive || canAdmin) return true; const segments = href.split("/").filter(Boolean); const moduleName = segments[0] === "settings" ? (segments[1] ?? "settings") : segments[0]; const globalPermissions = customRole.permissions.global; if (Array.isArray(globalPermissions) && globalPermissions.map(String).includes("view")) return true; const permissions = customRole.permissions[moduleName]; return Array.isArray(permissions) && permissions.map(String).includes("view"); };
  const tenantName = user.memberships.find((membership) => membership.tenantId === selectedTenantId)?.tenant?.name ?? selectedTenantId ?? "Workspace";
  const switchTenant = (tenantId: string) => { const token = getAccessToken(); if (!token) return; setSelectedTenantId(tenantId); setSession(token, tenantId); window.location.reload(); };
  return <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}><div className="sidebar-brand"><span className="brand">Activity Travel</span><span className="badge">OPS</span><button className="collapse-button" type="button" onClick={() => { setCollapsed(!collapsed); window.localStorage.setItem("activity_sidebar_collapsed", String(!collapsed)); }} aria-label="Toggle sidebar">{collapsed ? "→" : "←"}</button></div><nav aria-label="Primary navigation">{groups.map((group) => { const items = group.items.filter((item) => (group.label !== "Administration" || canAdmin) && canView(item.href)); if (!items.length) return null; return <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{items.map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link className={active ? "active" : ""} href={item.href} key={item.href}><span className="nav-icon">•</span><span>{item.label}</span></Link>; })}</div>; })}</nav><div className="sidebar-footer"><span className="tenant-dot" /><div><strong>{tenantName}</strong><small>{user.displayName} · {user.role.replaceAll("_", " ")}</small>{user.memberships.length > 1 && <select aria-label="Workspace" value={selectedTenantId} onChange={(event) => switchTenant(event.target.value)}>{user.memberships.map((membership) => <option key={membership.tenantId} value={membership.tenantId}>{membership.tenant?.name ?? membership.tenantId}</option>)}</select>}</div><button type="button" onClick={onLogout}>Sign out</button></div></aside>;
}
