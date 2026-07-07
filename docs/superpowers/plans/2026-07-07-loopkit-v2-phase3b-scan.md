# loopkit v2 Phase 3b — Vendor camera scan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Let the vendor **scan the customer's QR** with their phone camera to identify the customer — the new default check-in — falling back to typing the phone. Reuses the existing stamp/play flow once a phone is resolved.

**Architecture:** A vendor-gated `resolveTokenAction` turns a scanned `card_token` into a phone via the owner-gated `card_by_token` RPC (from 0006). A `ScanButton` client component lazy-imports `@zxing/browser`, opens the camera in a full-screen overlay, decodes a QR, resolves it, and hands the phone to the existing Stamp/Lucky form which submits as normal. No migration. The camera/decode path can't run in CI — only `resolveTokenAction` is unit-tested; the scan UI is manual smoke-test on a device.

**Tech Stack:** Next 16, TS strict, Supabase (schema `loopkit`), Vitest, pnpm 11, `@zxing/browser` (lazy). Builds on Phase 3a (0006 `card_by_token`).

## Global Constraints

- TS strict; no `any`/`@ts-ignore`; no inline comments; match existing style.
- `@zxing/browser` is imported ONLY via dynamic `import()` inside the scan component, so it stays off the main bundle.
- Scanning identifies; it does NOT stamp. The resolved phone flows into the existing vendor-gated stamp/play action (unchanged fraud posture).
- A token resolves ONLY for a program the calling vendor owns (`card_by_token` is owner-gated) — surface a clear error otherwise.
- Every task ends green: `pnpm check && pnpm test && pnpm build`.
- Spec: `docs/superpowers/specs/2026-07-07-loopkit-v2-core-design.md` §2.

---

## File Structure

- `src/app/dashboard/actions.ts` (modify) — add `resolveTokenAction`.
- `src/app/dashboard/scan-button.tsx` (new) — camera overlay + decode.
- `src/app/dashboard/stamp-form.tsx` (modify) — add `<ScanButton>`; scan fills phone + submits.
- `src/app/dashboard/lucky-form.tsx` (modify) — same.
- `package.json` — add `@zxing/browser`.
- Test: `test/app/resolve-token-action.test.ts`.

---

### Task 1: `resolveTokenAction`

**Files:** Modify `src/app/dashboard/actions.ts`; Test `test/app/resolve-token-action.test.ts`.

**Interfaces:** `resolveTokenAction(formData): Promise<ActionResult<{ phone: string }>>` — requireVendor; `card_by_token` RPC; returns the card's phone or a clear error.

- [ ] **Step 1: Failing test**

```ts
// test/app/resolve-token-action.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorMock, rpcMock } = vi.hoisted(() => ({
  requireVendorMock: vi.fn(),
  rpcMock: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

import { resolveTokenAction } from "@/app/dashboard/actions";

const fd = (token: string) => {
  const f = new FormData();
  f.set("token", token);
  return f;
};

describe("resolveTokenAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v" } });
  });
  it("returns the phone for a token the vendor owns", async () => {
    rpcMock.mockResolvedValue({
      data: [{ program_id: "p", card_id: "c", phone: "+6591234567" }],
      error: null,
    });
    const res = await resolveTokenAction(fd("tok"));
    expect(res).toEqual({ success: true, phone: "+6591234567" });
  });
  it("errors when the token is empty", async () => {
    const res = await resolveTokenAction(fd(""));
    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("errors when no card matches (not this shop's)", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const res = await resolveTokenAction(fd("tok"));
    expect(res.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`resolveTokenAction` not exported).

- [ ] **Step 3: Implement** in `src/app/dashboard/actions.ts`:

```ts
export async function resolveTokenAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
  await requireVendor();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { success: false, error: "No code scanned." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("card_by_token", {
    p_token: token,
  });
  if (error) {
    console.error("card_by_token failed", error.message);
    return { success: false, error: "Couldn't read that code." };
  }
  const row = data?.[0];
  if (!row) return { success: false, error: "That card isn't for this shop." };
  return { success: true, phone: row.phone };
}
```

- [ ] **Step 4: Run → PASS.** `pnpm check && pnpm test && pnpm build` green; commit `feat: resolveTokenAction (scan token -> phone)`.

---

### Task 2: `ScanButton` + wire into the counter forms

**Files:** Create `src/app/dashboard/scan-button.tsx`; Modify `src/app/dashboard/stamp-form.tsx`, `src/app/dashboard/lucky-form.tsx`; `package.json`.

**Interfaces:** `<ScanButton onScanned={(phone: string) => void} />` — opens the camera, decodes a QR, resolves it via `resolveTokenAction`, and calls `onScanned(phone)` on success (toast on failure).

- [ ] **Step 1:** `pnpm add @zxing/browser`.

- [ ] **Step 2:** Create `src/app/dashboard/scan-button.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { resolveTokenAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

export function ScanButton({
  onScanned,
}: {
  onScanned: (phone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          async (result) => {
            if (!result || cancelled) return;
            cancelled = true;
            controls.stop();
            const fd = new FormData();
            fd.set("token", result.getText());
            const res = await resolveTokenAction(fd);
            if (res.success) {
              onScanned(res.phone);
              setOpen(false);
            } else {
              toast.error(res.error);
              setOpen(false);
            }
          },
        );
        stop = () => controls.stop();
      } catch {
        toast.error("Couldn't open the camera. Check permissions.");
        setOpen(false);
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [open, onScanned]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-11 shrink-0 rounded-xl"
      >
        <Camera className="size-4" />
        <span className="sr-only sm:not-sr-only sm:ml-1.5">Scan</span>
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/90 p-5">
          <video
            ref={videoRef}
            className="w-full max-w-sm rounded-2xl"
            muted
            playsInline
          />
          <p className="text-sm text-white/80">
            Point at the customer&rsquo;s QR code
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            className="rounded-xl"
          >
            <X className="size-4" /> Cancel
          </Button>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3:** Wire into `stamp-form.tsx`: give the `<form>` a ref; add `<ScanButton onScanned={(phone) => { if (phoneRef.current) { phoneRef.current.value = phone; formRef.current?.requestSubmit(); } }} />` next to the phone input (inside the flex row, after the Add-stamp button, or on its own line above). The existing `onSubmit` already reads the phone from the form and runs `stampAction`, so a scanned phone submits identically. Keep the manual phone input as the fallback.

- [ ] **Step 4:** Wire into `lucky-form.tsx` the same way (scanned phone → set input value → `requestSubmit()` → existing `recordVisitAction`).

- [ ] **Step 5:** `pnpm check && pnpm test && pnpm build` green (the lazy `import("@zxing/browser")` must not break the build; verify `/dashboard` still compiles). Commit `feat: vendor camera scan on the counter`.

**Manual smoke (device, not CI):** on a phone, open `/dashboard` for a stamp program → Scan → allow camera → point at a `/c` QR → the phone fills and the stamp submits; Cancel closes the camera; denying permission shows the toast.

---

## Self-Review

**Spec coverage (§2):** vendor scans customer QR as the check-in (Task 2), resolving via owner-gated `card_by_token` (Task 1); phone entry stays the fallback (forms unchanged otherwise); scanning identifies only — stamp/play stay vendor-gated (reuses existing actions) ✓. NFC still deferred ✓.

**Placeholder scan:** camera decode is inherently runtime; `resolveTokenAction` is fully unit-tested; the `ScanButton` code is complete; wiring steps name the exact refs/methods (`phoneRef`, `formRef.current?.requestSubmit()`).

**Type consistency:** `resolveTokenAction` returns `ActionResult<{phone}>`; `card_by_token` row `{program_id,card_id,phone}` matches 0006; `ScanButton` `onScanned(phone: string)`; `@zxing/browser` `decodeFromVideoDevice(undefined, video, cb)` + `controls.stop()`.
