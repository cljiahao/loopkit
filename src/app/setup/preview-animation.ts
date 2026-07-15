"use client";

import { useEffect, useMemo, useState } from "react";
import { applyVisit, getProgress, type CardLike } from "@/lib/engine";
import type { EngineEvent, Progress } from "@/lib/engine/types";
import {
  buildInitialCard,
  buildPreviewProgram,
  buildPreviewProgress,
  type PreviewInput,
} from "@/app/setup/preview-state";

const TICK_MS = 3000;
const CELEBRATE_MS = 2000;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Drives the real applyVisit()/getProgress() engine functions on a timer, so
// the /setup preview simulates a customer actually visiting every 3 seconds
// instead of showing one static snapshot. Every tick is a genuine visit
// event through the same engine src/app/c's real customer page uses — the
// animation can never show a transition a real card couldn't actually
// produce.
export function usePreviewAnimation(input: PreviewInput): {
  progress: Progress;
  celebrating: boolean;
} {
  const {
    type,
    name,
    rewardText,
    stampsRequired,
    visitsToBloom,
    winPercent,
    pityCeiling,
    segments,
    headStart,
    headStartPercent,
    variant,
  } = input;

  // Every field is part of the "recipe" — any edit (including name, which
  // has no effect on card mechanics) resets and restarts the loop, per the
  // spec's explicit field-edit-interaction decision.
  const recipeKey = JSON.stringify([
    type,
    name,
    rewardText,
    stampsRequired,
    visitsToBloom,
    winPercent,
    pityCeiling,
    segments,
    headStart,
    headStartPercent,
    variant,
  ]);

  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const program = useMemo(
    () => buildPreviewProgram(input),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipeKey],
  );

  const initialCard = useMemo(
    () => buildInitialCard(input, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipeKey],
  );

  const [card, setCard] = useState<CardLike>(initialCard);
  const [simulatedNow, setSimulatedNow] = useState(() => new Date());
  const [phase, setPhase] = useState<"ticking" | "celebrating">("ticking");

  // Any recipe change restarts the loop immediately from the (possibly
  // head-start-seeded) initial position. Keyed on recipeKey rather than
  // initialCard itself: buildInitialCard returns a shared FRESH_CARD
  // singleton whenever headStart is false, so its object reference stays
  // identical across recipe changes and would never trip an [initialCard]
  // dependency — recipeKey is guaranteed to change on every field edit.
  useEffect(() => {
    // Resetting to a freshly-computed recipe snapshot on recipe change is
    // external-input-driven (the form's current field values), not
    // derivable from existing render state — the render-time-derivation
    // case react-hooks/set-state-in-effect guards against doesn't apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCard(initialCard);
    setSimulatedNow(new Date());
    setPhase("ticking");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeKey]);

  useEffect(() => {
    if (reducedMotion) return;
    const delay = phase === "celebrating" ? CELEBRATE_MS : TICK_MS;
    const timer = setTimeout(() => {
      if (phase === "celebrating") {
        setCard(initialCard);
        setSimulatedNow(new Date());
        setPhase("ticking");
        return;
      }
      const nextNow = new Date();
      const event: EngineEvent = {
        kind: "visit",
        payload: { roll: Math.random() },
      };
      const { state, rewardUnlocked } = applyVisit(
        program,
        card,
        event,
        nextNow,
      );
      setCard({ ...card, state });
      setSimulatedNow(nextNow);
      if (rewardUnlocked) setPhase("celebrating");
    }, delay);
    return () => clearTimeout(timer);
  }, [reducedMotion, phase, card, simulatedNow, program, initialCard]);

  if (reducedMotion) {
    return { progress: buildPreviewProgress(input), celebrating: false };
  }

  return {
    progress: getProgress(program, card, simulatedNow),
    celebrating: phase === "celebrating",
  };
}
