import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Component tests opt into jsdom via a `// @vitest-environment jsdom` docblock.
// This setup runs for every file (node tests included), so only touch the DOM
// when one actually exists — otherwise the node-env lib tests would throw.
if (typeof Element !== "undefined") {
  // jsdom doesn't implement these — Radix's Select (and any future
  // Radix-based popover component) calls them internally for positioning,
  // and throws without a stub.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  // Radix's Avatar checks `image.complete`/`image.naturalWidth` synchronously
  // right after setting `src` to decide whether to render the <img> or the
  // fallback. jsdom never actually fetches images, so `complete` stays false
  // forever and the avatar image never appears — report every image as
  // already loaded so AvatarImage resolves the same way a real browser would.
  if (typeof HTMLImageElement !== "undefined") {
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 1,
    });
  }
  // jsdom doesn't implement ResizeObserver — Radix's Switch calls it (via
  // @radix-ui/react-use-size inside SwitchBubbleInput, to size the hidden
  // native input that mirrors the switch for form submission) and throws
  // without a stub.
  if (typeof ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // jsdom doesn't implement matchMedia — usePreviewAnimation
  // (src/app/setup/preview-animation.ts) calls it to detect
  // prefers-reduced-motion. Default to "no preference" (matches: false) so
  // existing tests exercise the animated path; a test that needs to
  // simulate reduced motion overrides window.matchMedia itself.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as typeof window.matchMedia;
  }
}

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
