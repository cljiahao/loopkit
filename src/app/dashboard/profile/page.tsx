import { requireVendor } from "@/features/auth";
import { getVendorProfile } from "@/lib/vendor";
import { createServerClient } from "@/lib/supabase/server";
import { getOrCreateVendorProfile } from "@/lib/merqo-vendor-profile";
import { ProfileForm } from "@/app/dashboard/profile/profile-form";
import type { SocialLinks } from "@/lib/types";

export default async function ProfilePage() {
  const { user } = await requireVendor();
  const rawDisplayName = user.user_metadata?.display_name;
  const displayName = typeof rawDisplayName === "string" ? rawDisplayName : "";
  const profile = await getVendorProfile();

  const supabase = await createServerClient();
  // Same cross-schema, degrade-to-empty-on-failure pattern as /setup's page
  // (src/app/setup/page.tsx) — social links are a nice-to-have, not worth
  // hard-failing the whole profile page over a merqo hiccup.
  let socialLinks: SocialLinks = {};
  try {
    const vendorProfile = await getOrCreateVendorProfile(
      supabase,
      user.id,
      profile.name,
    );
    socialLinks = vendorProfile.social_links as SocialLinks;
  } catch (err) {
    console.error(
      "profile: shared vendor profile read failed",
      err instanceof Error ? err.message : err,
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-8 p-5 py-10 md:max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your stall name, social links, profile icon, how we address you, and
          your sign-in password. Each section saves on its own.
        </p>
      </div>
      <ProfileForm
        vendorId={user.id}
        email={user.email ?? ""}
        name={profile.name}
        avatarUrl={user.user_metadata?.avatar_url ?? null}
        displayName={displayName}
        socialLinks={socialLinks}
      />
    </main>
  );
}
