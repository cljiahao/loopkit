"use client";

import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { requestUpgrade } from "@/app/dashboard/plan/actions";
import { Button } from "@/components/ui/button";

/** Files an upgrade request and shows a confirmation toast. */
export function UpgradeCta() {
  const { pending, run } = useAsyncAction();

  function onClick() {
    run(async () => {
      const result = await requestUpgrade();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Request sent — we'll set you up shortly.");
    });
  }

  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={onClick}
      className="h-12 w-full rounded-xl text-base font-semibold"
    >
      {pending ? "Sending…" : "Request upgrade"}
    </Button>
  );
}
