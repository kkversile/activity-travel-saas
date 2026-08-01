"use client";
import { usePathname } from "next/navigation";

export function Topbar({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname() ?? "";
  const title = pathname.split("/").filter(Boolean).map((part) => part.replaceAll("-", " ")).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" / ") || "Dashboard";
  return <header className="topbar"><div><span className="breadcrumb">Operations / {title}</span><h1>{title}</h1></div><button type="button" onClick={onLogout}>Sign out</button></header>;
}
