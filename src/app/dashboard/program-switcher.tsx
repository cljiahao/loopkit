"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_PROGRAMS = "all";

// Same-page program switcher for every Stats/Activity/Customers view (merged
// and filtered alike), mirroring qkit's StatsControls: one instant picker,
// no submit button. Copies the current URL's other params (e.g. Customers'
// `q` search term) forward so switching programs never drops them. Uses
// shadcn's Select — Radix disallows an empty-string item value, so the
// "All programs" state (currentId === "") maps to an internal "all"
// sentinel that never leaks into the URL.
export function ProgramSwitcher({
  programs,
  currentId,
  basePath,
}: {
  programs: { id: string; name: string }[];
  currentId: string;
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (programs.length <= 1) return null;

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL_PROGRAMS) {
      params.set("p", value);
    } else {
      params.delete("p");
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <Select value={currentId || ALL_PROGRAMS} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Switch program"
        className="h-9 w-auto min-w-[10rem] shrink-0 rounded-lg border bg-card px-3 text-sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PROGRAMS}>All programs</SelectItem>
        {programs.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
