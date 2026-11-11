import { motion, useInView } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The How it works page's building blocks: one numbered step, one table, and the fade that brings each in.

export const EASE = [0.16, 1, 0.3, 1] as const;
export const enter = { duration: 0.5, ease: EASE };
export const draw = { duration: 0.6, ease: EASE };
export const VIEW = { once: true, amount: 0.5 } as const;

/** Fades and lifts its children once, the first time they scroll into view. */
export function Reveal({ delay = 0, className, children }: { delay?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ ...enter, delay }} className={className}>
      {children}
    </motion.div>
  );
}

/** A step is a numbered title, a short paragraph, a list of facts, a visual, and an optional full-width table
 *  under both. The titles and the paragraphs alone tell the whole story. The Example row holds the numbers
 *  of the example check, so it reads in the main text colour. */
export function Step({ n, title, lead, facts, visual, caption, children }: { n: number; title: string; lead: string; facts: [string, ReactNode][]; visual: ReactNode; caption?: string; children?: ReactNode }) {
  return (
    <section className="py-16">
      <div className="grid gap-x-16 gap-y-8 md:grid-cols-2 md:items-center">
        <Reveal>
          <h2 className="flex items-center gap-3 text-2xl font-medium tracking-tight">
            <span className="grid size-6 shrink-0 place-items-center rounded-sm border text-xs tracking-normal">{n}</span>
            {title}
          </h2>
          <p className="mt-4 leading-7 text-pretty">{lead}</p>
          <dl className="mt-4 divide-y divide-border/60">
            {facts.map(([term, text]) => (
              <div key={term} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[7rem_1fr]">
                <dt className="text-sm text-muted-foreground">{term}</dt>
                <dd className={cn("text-sm leading-6 text-pretty", term !== "Example" && "text-muted-foreground")}>{text}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
        <div>
          {visual}
          {caption && <p className="mt-4 text-xs text-muted-foreground">{caption}</p>}
        </div>
      </div>
      {children && <Reveal className="mt-12">{children}</Reveal>}
    </section>
  );
}

/** A plain table that turns into stacked rows on a phone. `head` names the columns; the first column leads.
 *  A last column of numbers sits on the right. `compact` keeps short values on one line on a phone.
 *  `ordered` is for the tables where the first row that fits wins: their rows arrive one after another, top to
 *  bottom, the way the code checks them. The other tables arrive as one block, so the order means something. */
export function Table({ head, rows, cols, compact, ordered }: { head: string[]; rows: (string | number)[][]; cols: string; compact?: boolean; ordered?: boolean }) {
  const body = useRef<HTMLDivElement>(null);
  const seen = useInView(body, { once: true, amount: 0.3 });
  return (
    <div className="rounded-xl border bg-card px-5">
      <div className={cn("hidden gap-x-6 border-b border-border/60 py-3 text-xs text-muted-foreground md:grid", cols)}>
        {head.map((h, i) => <span key={h} className={cn(i === head.length - 1 && typeof rows[0]?.[i] === "number" && "text-right")}>{h}</span>)}
      </div>
      <div ref={body} data-ordered={ordered ? "" : undefined} className="divide-y divide-border/60">
        {rows.map((row, r) => {
          const line = cn("gap-x-6 gap-y-1 py-3 text-sm md:items-baseline", compact ? "flex flex-wrap gap-x-4 md:grid md:gap-x-6" : "grid", cols);
          const cells = row.map((cell, i) => (
            <span key={i} className={cn("text-pretty", i === 0 ? "text-foreground" : "text-muted-foreground", compact && i === 0 && "w-full md:w-auto", i === row.length - 1 && typeof cell === "number" && "md:text-right")}>
              {i > 0 && head[i] && <span className="mr-2 text-xs md:hidden">{head[i]}</span>}
              {cell}
            </span>
          ));
          if (!ordered) return <div key={r} className={line}>{cells}</div>;
          return (
            <motion.div key={r} data-row initial={{ opacity: 0, y: 6 }} animate={seen ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }} transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: seen ? r * 0.04 : 0 }} className={line}>
              {cells}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
