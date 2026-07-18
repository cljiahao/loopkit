import { requireVendor } from "@/features/auth";
import { getVendorProfile } from "@/lib/vendor";
import { ProfileForm } from "@/app/dashboard/profile/profile-form";

export default async function ProfilePage() {
  const { user } = await requireVendor();
  const rawDisplayName = user.user_metadata?.display_name;
  const displayName = typeof rawDisplayName === "string" ? rawDisplayName : "";
  const profile = await getVendorProfile();

  return (
    <main className="mx-auto max-w-lg space-y-8 p-5 py-10 md:max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your stall name, profile icon, how we address you, and your sign-in
          password. Each section saves on its own.
        </p>
      </div>
      <ProfileForm
        vendorId={user.id}
        email={user.email ?? ""}
        name={profile.name}
        avatarUrl={user.user_metadata?.avatar_url ?? null}
        displayName={displayName}
      />
    </main>
  );
}
