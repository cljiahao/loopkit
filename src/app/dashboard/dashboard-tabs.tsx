"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Store, Users, History, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Counter", icon: Store },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/activity", label: "Activity", icon: History },
  { href: "/dashboard/grow", label: "Grow", icon: QrCode },
];

function isActive(path: string, href: string): boolean {
  return href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
}

export function DashboardTabs() {
  const path = usePathname();
  const searchParams = useSearchParams();
  const p = searchParams.get("p");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur-md sm:static sm:border-t-0 sm:bg-transparent sm:backdrop-blur-none">
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-1.5 sm:justify-start sm:gap-1 sm:px-5 sm:py-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const href = p ? `${tab.href}?p=${p}` : tab.href;
          const active = isActive(path, tab.href);
          return (
            <Link
              key={tab.href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors sm:flex-none sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm",
                active && "text-primary sm:bg-primary/10",
              )}
            >
              <Icon className="size-5 sm:size-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
