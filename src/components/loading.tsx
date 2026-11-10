import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

const STAGES = ["Reading recent pull requests", "Finding the newcomers", "Reading the contributing guide", "Working out the odds"];

/** What the page shows while a check runs. The stages move on a timer, not on real progress: the API sends one answer at the end. */
export function Loading({ repo }: { repo: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, STAGES.length - 1)), 1100);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid place-items-center py-24 text-center">
      <p className="text-sm text-muted-foreground">{repo}</p>
      <div className="relative mt-3 h-7 w-full">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.4, bounce: 0 }}
            className="absolute inset-x-0 text-lg"
          >
            {STAGES[i]}
          </motion.p>
        </AnimatePresence>
      </div>
      {/* The square of the current stage pulses, so the view never sits still: the last stage can last for seconds.
          `data-stage` names each square for tests: done, now or next. */}
      <div aria-hidden className="mt-6 flex gap-1">
        {STAGES.map((s, k) => (
          <motion.span
            key={s}
            data-stage={k < i ? "done" : k === i ? "now" : "next"}
            animate={{ opacity: k < i ? 1 : k === i ? [0.35, 1, 0.35] : 0.25 }}
            transition={k === i ? { duration: 1.2, ease: [0.77, 0, 0.175, 1], repeat: Infinity } : { duration: 0.2 }}
            className="size-2 bg-foreground"
          />
        ))}
      </div>
    </motion.div>
  );
}
