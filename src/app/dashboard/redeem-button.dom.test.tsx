// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { redeemMock } = vi.hoisted(() => ({ redeemMock: vi.fn() }));
vi.mock("@/app/dashboard/actions", () => ({ redeemAction: redeemMock }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { RedeemButton } from "@/app/dashboard/redeem-button";

describe("RedeemButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the exact stamp count consumed and carryover wording in the confirm dialog", async () => {
    const user = userEvent.setup();
    render(
      <RedeemButton
        card={{ id: "card-1", phone: "+6591234567", stamp_count: 11 }}
        stampsRequired={8}
        onRedeemed={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(
      screen.getByText(
        "Redeem reward for +6591234567? Uses 8 stamps — any extra carries over to their next card.",
      ),
    ).toBeInTheDocument();
  });
});
