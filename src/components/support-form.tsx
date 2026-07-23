"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { submitSupportMessageAction } from "@/app/actions/support";
import { SUPPORT_CATEGORY_LABELS } from "@/lib/schemas";
import type { SupportMessageInput } from "@/lib/schemas";

const CATEGORIES: { value: SupportMessageInput["category"]; label: string }[] =
  Object.entries(SUPPORT_CATEGORY_LABELS).map(([value, label]) => ({
    value: value as SupportMessageInput["category"],
    label,
  }));

/**
 * Vendor -> Merqo team help request. Sits in a Sheet off the account menu,
 * mirroring the feedback widget — see paykit's own
 * src/components/support-form.tsx, this is the same shape against
 * loopkit's own category set.
 */
export function SupportForm() {
  const [category, setCategory] =
    useState<SupportMessageInput["category"]>("program");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function send() {
    if (!body.trim()) {
      toast.error("Tell us what's wrong");
      return;
    }
    start(async () => {
      const res = await submitSupportMessageAction({
        category,
        body: body.trim(),
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
        Got it. We&apos;ll look into this and follow up.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="mb-2 text-sm font-medium">What&apos;s it about?</p>
        <ToggleGroup
          type="single"
          value={category}
          onValueChange={(v) =>
            v && setCategory(v as SupportMessageInput["category"])
          }
          spacing={1.5}
          aria-label="What's it about?"
          className="grid grid-cols-2"
        >
          {CATEGORIES.map((c) => (
            <ToggleGroupItem
              key={c.value}
              value={c.value}
              className={cn(
                "rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5",
                "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary",
              )}
            >
              {c.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Describe the problem"
        placeholder="What happened? The more detail, the faster we can help."
        rows={4}
        maxLength={2000}
        className="rounded-lg text-sm"
      />
      <Button
        type="button"
        className="h-11 w-full rounded-xl font-semibold"
        onClick={send}
        disabled={pending}
      >
        {pending ? "Sending…" : "Send message"}
      </Button>
    </div>
  );
}
