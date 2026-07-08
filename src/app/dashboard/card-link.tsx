"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CardLinkActions({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — long-press the link to copy it.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        className="rounded-lg"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => window.print()}
        className="rounded-lg"
      >
        <Printer className="size-4" />
        Print QR
      </Button>
    </div>
  );
}
