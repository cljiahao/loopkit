"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/landing/wordmark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/customers", label: "Customers" },
];

function isActive(path: string, href: string): boolean {
  return href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
}

/**
 * Dashboard sticky-header row: brand + page links on the left, Sign out on the
 * right. Sign-out is a `<form action={signOut}>` calling the server closure the
 * layout passes in — the only route out of the app until now.
 */
export function DashboardNav({ signOut }: { signOut: () => Promise<void> }) {
  const path = usePathname();

  return (
    <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        <Link
          href="/dashboard"
          aria-label="loopkit dashboard home"
          className="shrink-0 rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Wordmark className="text-xl" />
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Button
              key={l.href}
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-lg",
                isActive(path, l.href) && "bg-primary/10 text-primary",
              )}
            >
              <Link href={l.href}>{l.label}</Link>
            </Button>
          ))}
        </nav>
      </div>

      <form action={signOut}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="rounded-lg text-muted-foreground"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </form>
    </div>
  );
}
