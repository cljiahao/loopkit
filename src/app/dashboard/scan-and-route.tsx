"use client";

import { useRouter } from "next/navigation";
import { ScanButton } from "@/app/dashboard/scan-button";
import { ElevatedCard } from "@/components/elevated-card";

// Program-agnostic entry point: scans any of the vendor's cards and routes
// straight to that card's own program's Counter, phone pre-filled — no
// need to already be on the right program's card to serve a customer.
export function ScanAndRoute() {
  const router = useRouter();
  return (
    <ElevatedCard className="flex h-full flex-col justify-center gap-3 p-5">
      <p className="text-sm font-medium">Scan a customer to stamp or redeem.</p>
      <ScanButton
        label="Scan a customer"
        onResolved={({ phone, programId }) => {
          router.push(
            `/dashboard/counter?p=${programId}&phone=${encodeURIComponent(phone)}`,
          );
        }}
      />
    </ElevatedCard>
  );
}
