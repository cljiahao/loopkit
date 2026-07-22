# ui

## Purpose

shadcn/ui (new-york style) primitives — Radix-backed, CLI-managed; per this
repo's AGENTS.md these should not be hand-edited outside the shadcn CLI.

## Contents

- `alert-dialog.tsx` — Radix `AlertDialog` wrapper (Root/Trigger/Portal/Overlay/Content/Header/Footer/Title/Description/Action/Cancel), used by `RewardCelebration`'s confirmation modal
- `avatar.tsx` — Radix `Avatar` wrapper: `Avatar`/`AvatarImage`/`AvatarFallback` plus `AvatarBadge`/`AvatarGroup`/`AvatarGroupCount` for stacked-avatar UI, sized via a `size` data-attribute
- `badge.tsx` — `Badge` (cva variants: default/secondary/gold/destructive/outline/ghost/link), `asChild`-capable via Radix `Slot`
- `button.tsx` — `Button`/`buttonVariants` (cva: 6 variants × 8 sizes including icon/xs/sm/lg), `asChild`-capable via Radix `Slot`
- `card.tsx` — plain-div `Card` composition: `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardAction`/`CardContent`/`CardFooter`
- `dropdown-menu.tsx` — Radix `DropdownMenu` wrapper: full primitive set (Trigger/Content/Group/Item/CheckboxItem/RadioGroup/RadioItem/Label/Separator/Shortcut/Sub/SubTrigger/SubContent)
- `input.tsx` — `Input`: styled native `<input>` with focus-ring and `aria-invalid` styling
- `label.tsx` — `Label`: Radix `Label` wrapper, disabled-peer/group styling
- `popover.tsx` — Radix `Popover` wrapper: `Popover`/`PopoverTrigger`/`PopoverContent`/`PopoverAnchor`; used by `@/components/info-tooltip`'s `(i)` help icon
- `select.tsx` — Radix `Select` wrapper: `Select`/`SelectGroup`/`SelectValue`/`SelectTrigger`/`SelectContent`/`SelectLabel`/`SelectItem`/`SelectSeparator`/`SelectScrollUpButton`/`SelectScrollDownButton`
- `sheet.tsx` — Radix `Dialog`-backed slide-in panel: `Sheet`/`SheetTrigger`/`SheetClose`/`SheetPortal`/`SheetOverlay`/`SheetContent` (side `top`/`right`/`bottom`/`left`)/`SheetHeader`/`SheetFooter`/`SheetTitle`/`SheetDescription`; used by `dashboard-nav.tsx`'s Feedback drawer
- `switch.tsx` — Radix `Switch` wrapper: `Switch` with `sm`/`default` size variants
- `table.tsx` — plain-HTML `Table` composition: `Table`/`TableHeader`/`TableBody`/`TableFooter`/`TableRow`/`TableHead`/`TableCell`/`TableCaption`, wrapped in an overflow-x container

## Parent

[components](../README.md)
