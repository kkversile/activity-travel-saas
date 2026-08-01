"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/services/apiClient";
import { logout as logoutSession, type SessionUser } from "@/services/authService";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      window.location.replace("/login");
      return;
    }
    const stored = window.localStorage.getItem("activity_user");
    if (stored) setUser(JSON.parse(stored) as SessionUser);
  }, [router]);

  useEffect(() => {
    let dirty = false;
    const markDirty = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest("form")) dirty = true;
    };
    const clearDirty = () => {
      dirty = false;
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const confirmNavigation = (event: MouseEvent) => {
      if (!dirty) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (anchor?.href && anchor.origin === window.location.origin && !window.confirm("You have unsaved changes. Leave this page?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("submit", clearDirty, true);
    document.addEventListener("click", confirmNavigation, true);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      document.removeEventListener("submit", clearDirty, true);
      document.removeEventListener("click", confirmNavigation, true);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  const logout = () => {
    void logoutSession().finally(() => window.location.replace("/login"));
  };

  if (!user) return <div className="page-loading">Loading workspace...</div>;
  return <div className="app-shell"><Sidebar user={user} onLogout={logout} /><div className="workspace"><Topbar onLogout={logout} /><main className="page-content">{children}</main></div></div>;
}
