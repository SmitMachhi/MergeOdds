import { Star } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GITHUB_MARK } from "@/components/frame";
import { cn } from "@/lib/utils";
import { plural } from "../../shared/text";

// The link to this app's code on GitHub, with its live star count. The browser asks GitHub's public API, which allows
// 60 requests per hour per visitor and caches each answer for 60 seconds. When the count fails, the link shows without it.
const REPO = "SmitMachhi/MergeOdds";

export function SourceLink({ className }: { className?: string }) {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`https://api.github.com/repos/${REPO}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => typeof j?.stargazers_count === "number" && setStars(j.stargazers_count))
      .catch(() => {}); // the link works without the count
    return () => ctl.abort();
  }, []);
  return (
    <a
      href={`https://github.com/${REPO}`}
      target="_blank"
      rel="noreferrer"
      aria-label={stars === null ? "Source code on GitHub" : `Source code on GitHub, ${plural(stars, "star")}`}
      className={cn("inline-flex h-8 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground", className)}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
        <path d={GITHUB_MARK} />
      </svg>
      <span className="hidden sm:inline">MergeOdds</span>
      {stars !== null && (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="inline-flex items-center gap-1 tabular-nums">
          <Star aria-hidden className="size-3.5" strokeWidth={1.5} />
          {stars}
        </motion.span>
      )}
    </a>
  );
}
