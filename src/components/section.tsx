import { ElevatedCard } from "@/components/elevated-card";

// Icon-badge + eyebrow/title/description header over an ElevatedCard.
// Replaces the repeated hand-rolled <Card><CardHeader>...icon badge...
// block in profile-form.tsx and setup-form.tsx (Tasks 3 and 5).
export function Section({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <ElevatedCard as="section" className="px-7 py-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          {eyebrow ? (
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-0.5 font-display text-lg font-semibold leading-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </ElevatedCard>
  );
}
