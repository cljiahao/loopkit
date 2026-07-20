"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store, UserRound, IdCard, KeyRound, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/section";
import { SocialLinksFields } from "@/components/social-links-fields";
import { ImageUploader } from "@/components/image-uploader";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/hooks/use-async-action";
import type { SocialLinks } from "@/lib/types";
import {
  updateStallNameAction,
  updatePasswordAction,
  updateSocialLinksAction,
} from "./actions";

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

interface Props {
  vendorId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  displayName: string;
  socialLinks: SocialLinks;
}

export function ProfileForm({
  vendorId,
  email,
  name,
  avatarUrl,
  displayName,
  socialLinks,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  // Stall name — persisted via a server action (RLS-scoped write to
  // loopkit.vendors) + revalidatePath so the nav picks it up.
  const initialName = name ?? "";
  const [stallName, setStallName] = useState(initialName);
  const { pending: savingName, run: runName } = useAsyncAction();

  // Social/website links — profile-level defaults stored in the shared
  // merqo.vendor_profile row (Task 2's updateSocialLinksAction).
  const [links, setLinks] = useState<SocialLinks>(socialLinks);
  const { pending: savingLinks, run: runLinks } = useAsyncAction();

  // Photo — the uploader handles the storage upload; we persist the returned
  // URL straight to auth user_metadata client-side, same channel the nav
  // reads from (Task 3). No server action needed for this piece.
  const [avatar, setAvatar] = useState(avatarUrl);

  // Display name — private, decorative only (not shown anywhere else in
  // the app). Persisted the same way avatar_url already is: directly on
  // the auth user via the browser client, no server action needed.
  const initialDisplayName = displayName;
  const [display, setDisplay] = useState(initialDisplayName);
  const { pending: savingDisplay, run: runDisplay } = useAsyncAction();

  // Password — persisted via the browser auth client's own session, matched
  // client-side against a confirm field before it's ever sent.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { pending: savingPassword, run: runPassword } = useAsyncAction();

  function saveStallName() {
    return runName(async () => {
      const res = await updateStallNameAction(stallName.trim());
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Stall name saved");
      router.refresh();
    });
  }

  function saveLinks() {
    return runLinks(async () => {
      const res = await updateSocialLinksAction(links);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Links saved");
      router.refresh();
    });
  }

  async function handleAvatarChange(url: string | null) {
    setAvatar(url);
    const { error } = await supabase.auth.updateUser({
      data: { avatar_url: url },
    });
    if (error) {
      toast.error("Couldn't save your photo. Try again.");
      return;
    }
    toast.success(url ? "Photo saved" : "Photo removed");
    router.refresh();
  }

  function saveDisplayName() {
    return runDisplay(async () => {
      const trimmed = display.trim().slice(0, 60);
      const { error } = await supabase.auth.updateUser({
        data: { display_name: trimmed },
      });
      if (error) {
        toast.error("Couldn't save your display name. Try again.");
        return;
      }
      setDisplay(trimmed);
      toast.success("Display name saved");
      router.refresh();
    });
  }

  function savePassword() {
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    return runPassword(async () => {
      const res = await updatePasswordAction(password);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    });
  }

  const passwordsFilled = password.length > 0 && confirm.length > 0;

  return (
    <div className="md:columns-2 md:gap-5 [&>*]:mb-5 [&>*]:break-inside-avoid-column">
      <Section
        icon={<Store className="size-4" />}
        eyebrow="Shown to customers"
        title="Stall name"
        description="The name on your customers' card and at the counter."
      >
        <div className="space-y-2">
          <Label htmlFor="stall-name" className={labelClass}>
            Stall name
          </Label>
          <Input
            id="stall-name"
            value={stallName}
            maxLength={60}
            onChange={(e) => setStallName(e.target.value)}
            placeholder="Kopi Corner"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveStallName}
            disabled={savingName || stallName.trim() === initialName.trim()}
            className="h-10 rounded-xl font-semibold"
          >
            {savingName ? "Saving…" : "Save"}
          </Button>
        </div>
      </Section>

      <Section
        icon={<Share2 className="size-4" />}
        eyebrow="Shown to customers"
        title="Social & website"
        description="Shown on your customer's card. Each link is optional."
      >
        <SocialLinksFields
          value={links}
          onChange={setLinks}
          idPrefix="profile"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveLinks}
            disabled={savingLinks}
            className="h-10 rounded-xl font-semibold"
          >
            {savingLinks ? "Saving…" : "Save links"}
          </Button>
        </div>
      </Section>

      <Section
        icon={<UserRound className="size-4" />}
        eyebrow="Your account menu"
        title="Profile icon"
        description="A small image for your account menu. Defaults to your initials."
      >
        <ImageUploader
          bucket="vendor-images"
          pathPrefix={vendorId}
          value={avatar}
          onChange={handleAvatarChange}
        />
      </Section>

      <Section
        icon={<IdCard className="size-4" />}
        eyebrow="Just for you"
        title="Display name"
        description="How loopkit addresses you. Customers never see this."
      >
        <div className="space-y-2">
          <Label htmlFor="display-name" className={labelClass}>
            Display name
          </Label>
          <Input
            id="display-name"
            value={display}
            maxLength={60}
            onChange={(e) => setDisplay(e.target.value)}
            placeholder="e.g. Aisha"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveDisplayName}
            disabled={
              savingDisplay || display.trim() === initialDisplayName.trim()
            }
            className="h-10 rounded-xl font-semibold"
          >
            {savingDisplay ? "Saving…" : "Save"}
          </Button>
        </div>
      </Section>

      <Section
        icon={<KeyRound className="size-4" />}
        eyebrow="Sign-in security"
        title="Change password"
        description="Set a new password. At least 8 characters."
      >
        <div className="space-y-2">
          <Label htmlFor="email" className={labelClass}>
            Email
          </Label>
          <Input
            id="email"
            value={email}
            readOnly
            disabled
            className="h-11 rounded-xl bg-muted/40"
          />
          <p className="text-xs text-muted-foreground">
            Your sign-in email. It can&apos;t be changed here.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password" className={labelClass}>
            New password
          </Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password" className={labelClass}>
            Confirm new password
          </Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            placeholder="••••••••"
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={savePassword}
            disabled={savingPassword || !passwordsFilled}
            className="h-10 rounded-xl font-semibold"
          >
            {savingPassword ? "Updating…" : "Update password"}
          </Button>
        </div>
      </Section>
    </div>
  );
}
