"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Tailwind v4 scans source text for class names, so `line-clamp-${clamp}`
// would never be generated — it passes every local check and silently fails
// in production. The depth maps to a literal class instead.
const CLAMP_CLASS: Record<2 | 6, string> = {
  2: "line-clamp-2",
  6: "line-clamp-6",
};

// Long text clamped to a few lines with a Show full / Show less toggle, so the
// full text is reachable on touch (not just hover). Two callers on
// /votes/[id]: the vote title (an h1, clamp 2) and the bill summary (a
// paragraph, clamp 6).
//
// `longerThan` is a character count, and a character count cannot answer the
// question the toggle actually asks — whether the clamp cut anything off,
// which depends on the rendered width. Measured over the 287 bills whose
// summary is 211–1,200 characters: a >210 rule left 104 toggles revealing
// nothing at 1280 px while being nearly exact at 320 px, and no single number
// can be right at both. `measureClipping` therefore asks the DOM once it
// exists, and `longerThan` degrades to the pre-hydration guess.
//
// The guess still has to be there and has to be the same on both sides: it is
// what the server renders and what the first client render must reproduce, or
// React reports a hydration mismatch. It stays deliberately low, because a
// toggle that appears and then removes itself costs less than text that stays
// cut off with no way to reach it.
//
// The <h1> does not measure. Its clamp-2 / 70-character behaviour is pinned
// by the slice-5 spec, and the character rule is nearer the truth at two
// lines than at six.
export function ExpandableText({
  text,
  as: Tag,
  clamp,
  longerThan,
  measureClipping,
  expandLabel,
  className,
}: {
  text: string;
  as: "h1" | "p";
  clamp: 2 | 6;
  longerThan: number;
  measureClipping: boolean;
  expandLabel: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState<boolean | null>(null);
  const ref = useRef<HTMLElement>(null);

  // useLayoutEffect, not useEffect: the correction lands before the browser
  // paints the hydrated tree, so nothing flickers on a client-side
  // navigation. On a hard load the server HTML paints first no matter what
  // (node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md),
  // and the alternative — an inline script forcing layout during parsing —
  // would measure line heights before the webfont has settled.
  useLayoutEffect(() => {
    // An expanded block carries no clamp, so it always measures as unclipped.
    // Re-measuring here would delete the "Show less" the reader needs to get
    // back.
    if (!measureClipping || open) return;
    const el = ref.current;
    if (el === null) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight);
    measure();
    // Width changes the line count, and a font swap changes the height of the
    // clamped box; both move this element's box.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureClipping, open, text]);

  const long = clipped ?? text.length > longerThan;
  return (
    <div className="mt-3">
      <Tag
        ref={ref as React.Ref<HTMLHeadingElement & HTMLParagraphElement>}
        className={`${className} ${open || !long ? "" : CLAMP_CLASS[clamp]}`}
      >
        {text}
      </Tag>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-sm font-medium text-flag-blue hover:underline"
        >
          {open ? "Show less" : expandLabel}
        </button>
      )}
    </div>
  );
}
