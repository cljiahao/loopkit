"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Settings, User, Wallet, X } from "lucide-react";
import { Wordmark } from "@/components/landing/wordmark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Tier = "free" | "pro";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/stats", label: "Stats" },
];

function isActive(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

const TIER_BADGE: Record<Tier, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "bg-secondary text-muted-foreground ring-border",
  },
  pro: {
    label: "Pro",
    className:
      "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-400/15 dark:text-emerald-400 dark:ring-emerald-400/30",
  },
};

function TierBadge({ tier }: { tier: Tier }) {
  const { label, className } = TIER_BADGE[tier];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider ring-1 ring-inset",
        className,
      )}
    >
      {label}
    </span>
  );
}

/**
 * Up to two initials from a label (stall name when set, else the email
 * local part); falls back to a bullet. Splitting on the same separators
 * works for both "Kopi Corner" (space) and "jane.doe" (dot) shapes.
 */
function initials(label: string): string {
  const parts = label
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Dashboard sticky-header row: brand, vendor-level nav links
 * (Customers/Activity/Stats — none are program-scoped, each defaults to a
 * merged view across every program), and the account menu (Plan, Profile,
 * Sign out). Inline on sm+; below sm, links collapse behind a burger.
 */
export function DashboardNav({
  signOut,
  email,
  vendorName,
  avatarUrl,
  tier,
}: {
  signOut: () => Promise<void>;
  email: string;
  vendorName: string | null;
  avatarUrl: string | null;
  tier: Tier;
}) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const label = vendorName?.trim() || email.trim().split("@")[0];

  return (
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((v) => !v)}
          className="-ml-1.5 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary sm:hidden"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <Link
          href="/dashboard"
          aria-label="loopkit dashboard home"
          className="shrink-0 rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Wordmark className="text-xl" />
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {LINKS.map((link) => {
            const active =
              link.href === "/dashboard"
                ? path === "/dashboard"
                : isActive(path, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary",
                  active && "bg-primary/10 text-primary hover:bg-primary/10",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 text-left transition-colors outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Avatar className="size-8 shrink-0 rounded-md ring-1 ring-inset ring-primary/25">
              <AvatarImage src={avatarUrl ?? undefined} alt="" />
              <AvatarFallback className="rounded-md bg-primary/12 font-mono text-xs font-semibold tracking-tight text-primary">
                {initials(label)}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl">
          <DropdownMenuLabel className="px-2 py-2">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">
                {vendorName ?? email}
              </p>
              <TierBadge tier={tier} />
            </div>
            <p className="text-xs font-normal text-muted-foreground">
              {vendorName ? email : "Vendor account"}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/profile" className="cursor-pointer">
              <User className="size-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings" className="cursor-pointer">
              <Settings className="size-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/plan" className="cursor-pointer">
              <Wallet className="size-4" />
              Plan
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action={signOut}>
            <DropdownMenuItem asChild variant="destructive">
              <button type="submit" className="w-full cursor-pointer">
                <LogOut className="size-4" />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>

      {mobileOpen && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 cursor-default sm:hidden"
          />
          <div className="absolute inset-x-0 top-full z-40 border-b bg-background/95 px-5 py-3 backdrop-blur-md sm:hidden">
            <div className="flex flex-col gap-1">
              {LINKS.map((link) => {
                const active =
                  link.href === "/dashboard"
                    ? path === "/dashboard"
                    : isActive(path, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary",
                      active && "bg-primary/10 text-primary",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
