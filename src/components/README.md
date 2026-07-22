# components

## Purpose

Shared React components: the reward-mechanic visualizations (flame, plant,
cup, wheel, scratch, dots, points bar), general-purpose UI (back button,
image uploader, pro-lock, reward celebration), app-wide providers, and the
`landing/` and `ui/` subtrees.

## Contents

- `back-button.dom.test.tsx` — jsdom test: `BackButton` renders its label as a link with the given `href`
- `back-button.tsx` — `BackButton`: styled "leave this page" ghost button wrapping a `next/link`, mirrors qkit's identical component
- `card-burst.dom.test.tsx` — jsdom tests: `CardBurst` renders nothing when inactive; renders 24 absolutely (not fixed) positioned particles when active
- `card-burst.tsx` — `CardBurst`: client component rendering a container-relative fireworks-style particle burst (24 randomized pieces), used inside `RewardCelebration`
- `cup.dom.test.tsx` — jsdom tests: `Cup` renders an svg, no fill at stage 0, a fill rect once growth starts, latte-art circles only at the Full stage, dimmed fill when wilting, the shared 1600ms growth-transition duration on the fill, and the latte-art's fade+scale-in classes
- `cup.tsx` — `Cup`: SVG "cup filling with liquid" progress visualization for plant-variant "cup" programs, liquid height driven by `stage`/`totalStages`, smoothly animated over a shared 1600ms `motion-safe:` transition, latte-art foam fades+scales in at completion instead of popping
- `elevated-card.tsx` — `ElevatedCard`: shared polished-card primitive (rounded corners, soft two-layer lifted shadow, renders as `div`, `section`, or `li`) used app-wide (dashboard sub-pages, admin console, auth forms, profile/setup); deliberately not qkit's scalloped "kitchen ticket" `Ticket` theme
- `flame-layers.dom.test.tsx` — jsdom tests: `FlameLayers` renders the correct stage label/count for Spark/Inner Flame/Full Blaze, and always renders two flame icons
- `flame-layers.tsx` — `FlameLayers`: layered `lucide-react` `Flame` icons (inner+outer, lit by `stage`) with a stage-name/count caption, for stamp-variant "flame" programs
- `image-uploader.tsx` — `ImageUploader` client component: file-picker button that validates type/size, resizes+WebP-encodes via `resizeToWebp`, uploads to Supabase Storage, and calls `onChange` with the public URL
- `info-tooltip.tsx` — `InfoTooltip`: tap/click-triggered `(i)` icon-button (accessible name via its required `label` prop) opening a `ui/popover.tsx` with supplementary help text — used to move rationale/edge-case copy off the main field label so form microcopy stays one short line; deliberately click-based rather than hover-only `title`/CSS-hover tooltips, since most vendors use this on a phone
- `landing/`
- `plant.dom.test.tsx` — jsdom tests: `Plant` renders an svg, collapses the stem and shows the seed dot at stage 0, scales the stem toward full height as stage increases, shows `leafPairs = min(stage, 3)` leaf slots as visible with the rest hidden, keeps an already-placed leaf pair's position stable when a new pair appears, renders the bloom only at the final stage, dims the color when wilting
- `plant.tsx` — `Plant`: SVG growing-plant progress visualization (stem height, leaf pairs, bloom petals) driven by `stage`/`totalStages`/`wilting`, for plant-variant "plant" programs. The stem is a fixed-length line animated via a `scaleY` transform (not a resized line, since `x1/y1/x2/y2` aren't CSS-animatable) over a shared 1600ms `motion-safe:` transition; leaf-pair positions are fixed slots (never reflow when a new pair appears) that fade+scale in with a per-leaf stagger; the bloom fades+scales in at the final stage instead of popping
- `points-bar.tsx` — `PointsBar`: horizontal progress bar with a "filled / total points" caption, for stamp-variant "points" programs
- `pro-lock.tsx` — `ProLock`: inline pill linking to `/dashboard/plan`, marks a free-tier vendor's Pro-only limit
- `providers.tsx` — `Providers` client component: wraps `children` with a `sonner` `Toaster` (top-right, rich colors), mounted once in the root layout
- `reward-celebration.dom.test.tsx` — jsdom tests: `RewardCelebration` renders the "Reward unlocked!" dialog with a `CardBurst` overlay when open (queried via `screen` since content is portal-rendered), renders nothing when closed
- `reward-celebration.tsx` — `RewardCelebration` client component: `AlertDialog`-based congratulation modal with a `CardBurst` overlay, shows the customer phone and reward text
- `scratch-card.tsx` — `ScratchCard`: two-layer card (reward/label content beneath an opacity-animated "Scratch to reveal" overlay) for scratch-variant programs
- `section.dom.test.tsx` — jsdom tests: `Section` renders its icon/eyebrow/title/description/children, omits the eyebrow paragraph when not provided, and renders as a `<section>` element
- `section.tsx` — `Section`: icon-badge + eyebrow/title/description header wrapping an `ElevatedCard`, replaces the repeated hand-rolled `Card`/`CardHeader` icon-badge block previously duplicated in `profile-form.tsx` and `setup-form.tsx`
- `social-icons.tsx` — exports `SOCIAL_LINK_FIELDS`: the shared website/Instagram/Facebook/TikTok field list (key, label, icon), using real brand marks in official colors via `@icons-pack/react-simple-icons` (website falls back to a generic `lucide-react` globe)
- `social-links-fields.dom.test.tsx` — jsdom tests: `SocialLinksFields` renders one input per social field prefilled from `value`, adds a key on type, removes a key when its field is cleared
- `social-links-fields.tsx` — `SocialLinksFields` client component: one labeled input per `SOCIAL_LINK_FIELDS` entry, empty string in `onChange` deletes the key rather than storing `""`; shared by the profile page and reused wherever vendor social links are edited
- `stamp-dots.tsx` — `StampDots`: row of dot/gift icons (filled = stamped, dashed = pending, last slot styled as the reward) with a pop animation on the most recently filled dot
- `ui/`
- `wheel.tsx` — `Wheel`: SVG spinning-wheel visualization computing per-segment pie slices and a rotation transform that lands on `landedId`, reward segments styled gold

## Connectivity

`landing/` composes the marketing sections rendered by `src/app/page.tsx`;
`ui/` is the shadcn/ui primitive layer (`Button`, `AlertDialog`, etc.) that
both this folder's own components (`back-button.tsx`, `reward-celebration.tsx`)
and `landing/` build on. The reward-mechanic visualizations
(`flame-layers.tsx`, `plant.tsx`, `cup.tsx`, `wheel.tsx`, `scratch-card.tsx`,
`stamp-dots.tsx`, `points-bar.tsx`) each render one `src/lib/engine/`
strategy's `ProgressView` variant and are selected by the dashboard/customer
card views based on the program's `type`/`variant`.

## Parent

[src](../README.md)
