// src/components/section.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Store } from "lucide-react";
import { Section } from "@/components/section";

describe("Section", () => {
  it("renders icon, eyebrow, title, description, and children", () => {
    render(
      <Section
        icon={<Store data-testid="icon" />}
        eyebrow="Shown to customers"
        title="Stall name"
        description="The name on your customers' card."
      >
        <p>field content</p>
      </Section>,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Shown to customers")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stall name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The name on your customers' card."),
    ).toBeInTheDocument();
    expect(screen.getByText("field content")).toBeInTheDocument();
  });

  it("omits the eyebrow paragraph when not provided", () => {
    render(
      <Section icon={<Store />} title="Title only" description="desc">
        <p>child</p>
      </Section>,
    );
    expect(screen.queryByText("Shown to customers")).not.toBeInTheDocument();
  });

  it("renders as a <section> element", () => {
    const { container } = render(
      <Section icon={<Store />} title="T" description="D">
        <p>c</p>
      </Section>,
    );
    expect(container.querySelector("section")).toBeInTheDocument();
  });
});
