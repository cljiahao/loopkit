"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { recordVisitAction } from "@/app/dashboard/actions";
import { ScanButton } from "@/app/dashboard/scan-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PlayResult = { won: boolean; reward_text: string; phone: string };

export function LuckyForm({ programId }: { programId: string }) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();
  const phoneRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<PlayResult | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    run(async () => {
      const res = await recordVisitAction(formData);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      if (res.rewardUnlocked) {
        toast.success(`🎉 ${res.phone} won ${res.reward_text}!`);
      } else {
        toast(`No win this time for ${res.phone}.`);
      }
      setResult({
        won: res.rewardUnlocked,
        reward_text: res.reward_text,
        phone: res.phone,
      });
      router.refresh();
      formEl.reset();
      phoneRef.current?.focus();
    });
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={onSubmit} className="flex items-end gap-3">
        <input type="hidden" name="program_id" value={programId} />
        <div className="flex-1 space-y-2">
          <Label
            htmlFor="phone"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Customer phone
          </Label>
          <Input
            ref={phoneRef}
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="9123 4567"
            className="h-11 rounded-xl"
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="h-11 rounded-xl px-6 font-semibold"
        >
          {pending ? "Playing…" : "Play"}
        </Button>
        <ScanButton
          onScanned={(phone) => {
            if (phoneRef.current) {
              phoneRef.current.value = phone;
              formRef.current?.requestSubmit();
            }
          }}
        />
      </form>

      {result && (
        <div
          className={
            result.won
              ? "rounded-xl border border-gold bg-gold/10 p-4"
              : "rounded-xl border bg-muted/40 p-4"
          }
        >
          <p className="text-sm font-medium">{result.phone}</p>
          {result.won ? (
            <p className="mt-1 text-sm font-semibold text-gold-foreground">
              🎉 Won {result.reward_text}!
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              No win this time.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
