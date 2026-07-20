import { cn } from "@/lib/utils";

// The polished-card look shared across profile/dashboard/setup: rounded
// corners, a soft two-layer lifted shadow, no scallop/paper theme (that's
// qkit's Ticket component, deliberately not adopted here — see
// docs/superpowers/specs/2026-07-19-dashboard-setup-profile-uiux-design.md).
export function ElevatedCard({
  as: As = "div",
  className,
  children,
  ...props
}: {
  as?: "div" | "section";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={cn(
        "rounded-[20px] border bg-card shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_rgba(0,0,0,0.35)]",
        className,
      )}
      {...props}
    >
      {children}
    </As>
  );
}
