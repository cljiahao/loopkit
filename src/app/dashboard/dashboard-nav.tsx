"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, LogOut, Menu, User, X } from "lucide-react";
import { Wordmark } from "@/components/landing/wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Program } from "@/lib/program";

type Tier = "free" | "pro";

const LINKS = [
  { href: "/dashboard", label: "Counter", scoped: true },
  { href: "/dashboard/customers", label: "Customers", scoped: true },
  { href: "/dashboard/activity", label: "Activity", scoped: true },
  { href: "/dashboard/stats", label: "Stats", scoped: true },
  { href: "/dashboard/grow", label: "Grow", scoped: false },
  { href: "/dashboard/plan", label: "Plan", scoped: true },
];
function isActive(path: string, href: string): boolean {
  return href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
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
 * Dashboard sticky-header row: brand, program switcher (only if the vendor
 * has more than one program), page links, and the account menu — one merged
 * bar, matching qkit's dashboard-nav architecture (qkit has no multi-program
 * switcher, so that piece is loopkit-specific). Inline on sm+; below sm, page
 * links + the switcher collapse behind a burger button.
 */
export function DashboardNav({
  signOut,
  email,
  vendorName,
  avatarUrl,
  tier,
  programs,
  activeByProgramId,
}: {
  signOut: () => Promise<void>;
  email: string;
  vendorName: string | null;
  avatarUrl: string | null;
  tier: Tier;
  programs: Program[];
  activeByProgramId: Record<string, number>;
}) {
  const path = usePathname();
  const searchParams = useSearchParams();
  const p = searchParams.get("p");
  const [mobileOpen, setMobileOpen] = useState(false);
  const label = vendorName?.trim() || email.trim().split("@")[0];

  const withProgram = (href: string) => (p ? `${href}?p=${p}` : href);
  const currentProgram = programs.find((prog) => prog.id === p) ?? programs[0];

  return (
    <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/dashboard"
          aria-label="loopkit dashboard home"
          className="shrink-0 rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Wordmark className="text-xl" />
        </Link>

        {programs.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="hidden max-w-[9rem] items-center gap-1 truncate rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex"
              >
                <span className="truncate">
                  {currentProgram?.name ?? "Program"}
                </span>
                <ChevronDown className="size-3.5 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 rounded-xl">
              {programs.map((prog) => (
                <DropdownMenuItem key={prog.id} asChild>
                  <Link
                    href={`/dashboard?p=${prog.id}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{prog.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {activeByProgramId[prog.id] ?? 0} active
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <nav className="hidden items-center gap-1 sm:flex">
        {LINKS.map((link) => {
          const active = isActive(path, link.href);
          return (
            <Link
              key={link.href}
              href={link.scoped ? withProgram(link.href) : link.href}
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

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary sm:hidden"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 text-left transition-colors outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span
                aria-hidden="true"
                className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-primary/12 font-mono text-xs font-semibold tracking-tight text-primary ring-1 ring-inset ring-primary/25"
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt=""
                    fill
                    sizes="2rem"
                    className="object-cover"
                  />
                ) : (
                  initials(label)
                )}
              </span>
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
      </div>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-20 border-b bg-background/95 px-5 py-3 backdrop-blur-md sm:hidden">
          {programs.length > 1 && (
            <div className="mb-2 flex flex-col gap-1 border-b pb-2">
              {programs.map((prog) => (
                <Link
                  key={prog.id}
                  href={`/dashboard?p=${prog.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary",
                    prog.id === currentProgram?.id && "text-primary",
                  )}
                >
                  <span className="truncate">{prog.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {activeByProgramId[prog.id] ?? 0} active
                  </span>
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => {
              const active = isActive(path, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.scoped ? withProgram(link.href) : link.href}
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
      )}
    </div>
  );
}
