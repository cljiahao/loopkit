"use client";
import { useState, useTransition } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { submitFeedbackAction } from "@/app/actions/feedback";

// Client-side schema validation — matches the schema in submitFeedbackAction.
const feedbackSchema = z.object({
  nps: z.number().int().min(0).max(10),
  message: z.string().trim().max(2000).optional(),
});
type FeedbackInput = z.infer<typeof feedbackSchema>;

/** Vendor NPS + optional comment widget, ported from Merqo's own hub-level
 *  FeedbackForm. Sits in a Sheet off the account menu. */
export function FeedbackForm() {
  const [score, setScore] = useState(-1);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function send() {
    if (score < 0) {
      toast.error("Pick a score first");
      return;
    }

    // Client-side validation before calling server action.
    const input: FeedbackInput = {
      nps: score,
      message: message.trim() || undefined,
    };
    const parsed = feedbackSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid feedback");
      return;
    }

    start(async () => {
      const res = await submitFeedbackAction(parsed.data);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
        Thanks for the feedback — it helps us improve.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium">
        How likely are you to recommend loopkit to another vendor?
      </p>
      <div
        className="grid grid-cols-11 gap-1"
        role="radiogroup"
        aria-label="Recommend score, 0 to 10"
      >
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n}`}
            onClick={() => setScore(n)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition-colors",
              score === n
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/50 hover:bg-primary/5",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
        <span>Not likely</span>
        <span>Very likely</span>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        aria-label="Anything else?"
        placeholder="Anything we can improve? (optional)"
        rows={3}
        maxLength={2000}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <Button
        type="button"
        className="h-11 w-full rounded-xl font-semibold"
        onClick={send}
        disabled={pending}
      >
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </div>
  );
}
