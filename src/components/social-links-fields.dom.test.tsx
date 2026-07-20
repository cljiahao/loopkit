// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SocialLinksFields } from "@/components/social-links-fields";

describe("SocialLinksFields", () => {
  it("renders one input per social field, prefilled from value", () => {
    render(
      <SocialLinksFields
        value={{ website: "https://kopicorner.com" }}
        onChange={vi.fn()}
        idPrefix="test"
      />,
    );
    expect(screen.getByLabelText(/website/i)).toHaveValue(
      "https://kopicorner.com",
    );
    expect(screen.getByLabelText(/instagram/i)).toHaveValue("");
  });

  it("adds a key when a field is typed into", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SocialLinksFields value={{}} onChange={onChange} idPrefix="test" />,
    );
    await user.type(screen.getByLabelText(/instagram/i), "x");
    expect(onChange).toHaveBeenLastCalledWith({ instagram: "x" });
  });

  it("removes a key when its field is cleared", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SocialLinksFields
        value={{ website: "a" }}
        onChange={onChange}
        idPrefix="test"
      />,
    );
    await user.clear(screen.getByLabelText(/website/i));
    expect(onChange).toHaveBeenLastCalledWith({});
  });
});
