"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { setVendorPro } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

/** Per-row Make Pro / Remove Pro control — no modal, immediate write + toast. */
export function VendorProToggle({
  vendorId,
  email,
  isPro,
}: {
  vendorId: string;
  email: string | null;
  isPro: boolean;
}) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();
  const nextPro = !isPro;
  const who = email ?? "vendor";

  function toggle() {
    run(async () => {
      const fd = new FormData();
      fd.set("vendorId", vendorId);
      fd.set("pro", String(nextPro));
      const result = await setVendorPro(fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        nextPro ? `${who} is now Pro.` : `Removed Pro from ${who}.`,
      );
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant={isPro ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={toggle}
      className="rounded-xl"
    >
      {pending ? "Saving…" : isPro ? "Remove Pro" : "Make Pro"}
    </Button>
  );
}
