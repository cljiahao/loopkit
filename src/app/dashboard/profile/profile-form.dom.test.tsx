// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { updateStallNameMock, updatePasswordMock, updateSocialLinksMock } =
  vi.hoisted(() => ({
    updateStallNameMock: vi.fn().mockResolvedValue({}),
    updatePasswordMock: vi.fn().mockResolvedValue({}),
    updateSocialLinksMock: vi.fn().mockResolvedValue({}),
  }));
vi.mock("./actions", () => ({
  updateStallNameAction: updateStallNameMock,
  updatePasswordAction: updatePasswordMock,
  updateSocialLinksAction: updateSocialLinksMock,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/image-uploader", () => ({
  ImageUploader: () => <div data-testid="image-uploader" />,
}));

import { ProfileForm } from "./profile-form";

describe("ProfileForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders all 5 sections", () => {
    render(
      <ProfileForm
        vendorId="v1"
        email="a@b.com"
        name="Kopi Corner"
        avatarUrl={null}
        displayName=""
        socialLinks={{}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Stall name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Social & website" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Profile icon" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Display name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Change password" }),
    ).toBeInTheDocument();
  });

  it("prefills the social links fields and saves them", async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        vendorId="v1"
        email="a@b.com"
        name="Kopi Corner"
        avatarUrl={null}
        displayName=""
        socialLinks={{ website: "https://kopicorner.com" }}
      />,
    );
    expect(screen.getByLabelText(/website/i)).toHaveValue(
      "https://kopicorner.com",
    );

    await user.type(
      screen.getByLabelText(/instagram/i),
      "https://instagram.com/x",
    );
    await user.click(screen.getByRole("button", { name: "Save links" }));

    expect(updateSocialLinksMock).toHaveBeenCalledWith({
      website: "https://kopicorner.com",
      instagram: "https://instagram.com/x",
    });
  });

  it("saves the stall name", async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        vendorId="v1"
        email="a@b.com"
        name="Kopi Corner"
        avatarUrl={null}
        displayName=""
        socialLinks={{}}
      />,
    );
    const input = screen.getByLabelText("Stall name");
    await user.clear(input);
    await user.type(input, "New Name");
    const stallNameSection = screen
      .getByRole("heading", { name: "Stall name" })
      .closest("section")!;
    await user.click(
      within(stallNameSection).getByRole("button", { name: "Save" }),
    );

    expect(updateStallNameMock).toHaveBeenCalledWith("New Name");
  });
});
