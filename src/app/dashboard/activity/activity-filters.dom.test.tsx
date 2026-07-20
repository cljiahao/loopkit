// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFilters } from "./activity-filters";

describe("ActivityFilters", () => {
  it("renders the type/from/to fields and an Apply filters button", () => {
    render(
      <ActivityFilters
        basePath="/dashboard/activity"
        currentP={undefined}
        type={undefined}
        from={undefined}
        to={undefined}
      />,
    );
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });

  it("shows a Clear filters link and preserves the program id when a filter is active", () => {
    render(
      <ActivityFilters
        basePath="/dashboard/activity"
        currentP="p1"
        type="stamps"
        from="2026-07-01"
        to="2026-07-10"
      />,
    );
    const clear = screen.getByText("Clear filters");
    expect(clear).toHaveAttribute("href", "/dashboard/activity?p=p1");
    expect(screen.getByLabelText("From")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-07-10");
  });
});
