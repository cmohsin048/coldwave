"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  Send,
  Sparkles,
  ShieldCheck,
  Flame,
  BarChart3,
  Inbox,
  Settings,
  Mail,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/designer", label: "AI Designer", icon: Sparkles },
  { href: "/inbox", label: "Unified Inbox", icon: Inbox },
  { href: "/mailboxes", label: "Mailboxes", icon: Mail },
  { href: "/warmup", label: "Warmup", icon: Flame },
  { href: "/deliverability", label: "Deliverability", icon: ShieldCheck },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-6 font-bold">
        <Waves className="h-6 w-6 text-primary" />
        ColdWave
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
