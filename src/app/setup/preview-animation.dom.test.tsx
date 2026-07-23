// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePreviewAnimation } from "@/app/setup/preview-animation";
import type { PreviewInput } from "@/app/setup/preview-state";

const base: Omit<PreviewInput, "type"> = {
  name: "Coffee card",
  rewardText: "Free kopi",
  stampsRequired: 10,
  visitsToBloom: 6,
  winPercent: 20,
  pityCeiling: 8,
  segments: [
    { label: "Try again", weight: 5, is_reward: false },
    { label: "Free item", weight: 1, is_reward: true },
  ],
  headStart: false,
  headStartPercent: 20,
  variant: "dots",
};

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

describe("usePreviewAnimation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks the stamp count up every 2 seconds", () => {
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "stamp" }),
    );
    expect(result.current.progress.label).toBe("0/10 stamps");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress.label).toBe("1/10 stamps");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress.label).toBe("2/10 stamps");
  });

  it("celebrates on completion, then resets to zero after the pause", () => {
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "stamp", stampsRequired: 2 }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress.label).toBe("1/2 stamps");
    expect(result.current.celebrating).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress.label).toBe("2/2 stamps");
    expect(result.current.celebrating).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress.label).toBe("0/2 stamps");
    expect(result.current.celebrating).toBe(false);
  });

  it("resets to the head-start position, not zero, when looping", () => {
    const { result } = renderHook(() =>
      usePreviewAnimation({
        ...base,
        type: "stamp",
        stampsRequired: 2,
        headStart: true,
      }),
    );
    expect(result.current.progress.label).toBe("1/2 stamps");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress.label).toBe("2/2 stamps");
    expect(result.current.celebrating).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress.label).toBe("1/2 stamps");
  });

  it("restarts immediately when the recipe changes", () => {
    const { result, rerender } = renderHook(
      (props: PreviewInput) => usePreviewAnimation(props),
      { initialProps: { ...base, type: "stamp" } },
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress.label).toBe("1/10 stamps");

    rerender({ ...base, type: "stamp", stampsRequired: 5 });
    expect(result.current.progress.label).toBe("0/5 stamps");
  });

  it("lucky can win before the pity ceiling via a real roll against the configured odds", () => {
    const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.01);
    const { result } = renderHook(() =>
      usePreviewAnimation({
        ...base,
        type: "lucky",
        winPercent: 50,
        pityCeiling: 8,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.celebrating).toBe(true);
    rollSpy.mockRestore();
  });

  it("wheel can land on a non-reward segment via a real roll against the configured weights", () => {
    // base.segments is [Try again (weight 5), Free item (weight 1)] —
    // pickSegment's cumulative buckets are [0, 0.833) = Try again,
    // [0.833, 1.0) = Free item, so 0.1 lands solidly in the non-reward
    // bucket regardless of segment order.
    const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.celebrating).toBe(false);
    rollSpy.mockRestore();
  });

  it("falls back to a static, non-ticking snapshot under prefers-reduced-motion", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "stamp" }),
    );
    expect(result.current.progress.label).toBe("0/10 stamps");
    expect(result.current.celebrating).toBe(false);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.progress.label).toBe("0/10 stamps");
  });

  it("sets lastChanceResult when a wheel spin wins", () => {
    const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(result.current.lastChanceResult).toEqual({ won: true });
    rollSpy.mockRestore();
  });

  it("sets lastChanceResult when a wheel spin loses", () => {
    const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(result.current.lastChanceResult).toEqual({ won: false });
    rollSpy.mockRestore();
  });

  it("sets lastChanceResult for scratch the same way as wheel", () => {
    const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { result } = renderHook(() =>
      usePreviewAnimation({
        ...base,
        type: "scratch",
        pityCeiling: undefined,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(result.current.lastChanceResult).toEqual({ won: true });
    rollSpy.mockRestore();
  });

  it("enters a revealing phase after a tick, delaying the win/lose result", () => {
    const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.revealing).toBe(true);
    expect(result.current.lastChanceResult).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(result.current.revealing).toBe(false);
    expect(result.current.lastChanceResult).toEqual({ won: true });
    rollSpy.mockRestore();
  });

  it("masks landedId to null while revealing", () => {
    const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    if (result.current.progress.view.kind !== "chance") {
      throw new Error("expected chance view");
    }
    expect(result.current.progress.view.landedId).toBeNull();
    rollSpy.mockRestore();
  });

  it("never enters the revealing phase under prefers-reduced-motion", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
    );
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.revealing).toBe(false);
  });

  it("never sets lastChanceResult for non-chance types", () => {
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "stamp" }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.lastChanceResult).toBeNull();
  });

  it("resets lastChanceResult to null when the recipe changes", () => {
    const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { result, rerender } = renderHook(
      (props: PreviewInput) => usePreviewAnimation(props),
      {
        initialProps: {
          ...base,
          type: "wheel" as const,
          pityCeiling: undefined,
        },
      },
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(result.current.lastChanceResult).toEqual({ won: true });

    rerender({
      ...base,
      type: "wheel",
      pityCeiling: undefined,
      name: "New name",
    });
    expect(result.current.lastChanceResult).toBeNull();
    rollSpy.mockRestore();
  });
});
