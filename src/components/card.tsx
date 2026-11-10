import { motion } from "motion/react";
import type { ReactNode } from "react";
import { GRADE } from "@/lib/ui";
import { cn } from "@/lib/utils";
import type { Metric } from "../../shared/types";

// The pieces the report and the How it works page share: the card, the dithered divider and the grade tile.

export const rise = {
  hidden: { opacity: 0, y: 14, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring" as const, duration: 0.6, bounce: 0 } },
};
export const spring = { type: "spring" as const, duration: 0.9, bounce: 0 };

/** A 2px dithered line: the page's divider. */
export function Rule2({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-0.5 text-white/15 dither-50", className)} />;
}

export function Card({ title, hint, className, children }: { title?: string; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <motion.section variants={rise} className={cn("relative overflow-hidden rounded-xl border bg-card p-5", className)}>
      {title && (
        <header className="mb-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">{title}</h2>
            {hint && <span className="text-right text-xs text-muted-foreground">{hint}</span>}
          </div>
          <Rule2 className="mt-3" />
        </header>
      )}
      {children}
    </motion.section>
  );
}

/** A grade as a level meter: the dither fill climbs with the grade, and the letter sits on a solid plate in the middle. */
export function GradeTile({ grade }: { grade: Metric["grade"] }) {
  const g = grade ? GRADE[grade] : null;
  return (
    <span className={cn("relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-current/40", g ? g.text : "text-zinc-500")}>
      <motion.span
        aria-hidden
        className={cn("absolute inset-x-0 bottom-0 origin-bottom opacity-60", g ? g.fill : "dither-25")}
        style={{ height: g ? g.height : "100%" }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ ...spring, delay: 0.3 }}
      />
      {/* the plate is a deeper shade of the grade's colour, so the white letter reads on every grade */}
      <span className={cn("relative grid size-6 place-items-center rounded-sm text-lg leading-none font-semibold text-white", g ? g.plate : "bg-zinc-600")}>
        {grade ?? "?"}
      </span>
    </span>
  );
}
