import { motion } from "motion/react";
import type { ReactNode } from "react";
import { DitherGradient } from "@/components/dither-kit";
import { BRAND } from "@/lib/ui";
import { useSettled } from "@/lib/use-settled";

// Brand marks, drawn inline: the icon set we use ships no logos.
const SOCIALS = [
  {
    label: "Smit on X",
    handle: "smitpotato",
    href: "https://x.com/smitpotato",
    path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  },
  {
    label: "Smit on GitHub",
    handle: "smitmachhi",
    href: "https://github.com/smitmachhi/",
    path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  },
];

/** The wash and the profile links fade in once the page has settled, just after the main content starts to rise. */
const fade = (on: boolean, delay: number) => ({ initial: { opacity: 0 }, animate: { opacity: on ? 1 : 0 }, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const, delay } });

const LINK = "inline-flex h-10 items-center gap-2 px-2 text-sm text-muted-foreground transition-colors hover:text-foreground";

/** What every page shares: the red dither wash at the bottom and the two profile links on the left. */
export function Frame({ children }: { children: ReactNode }) {
  const settled = useSettled();
  return (
    <div className="relative min-h-svh">
      {/* The wash is 18rem on a long page. On the home page, which is one screen tall, it shrinks to half the
          page minus 13rem so it stays under the centred text. Percent, not svh: a full-page screenshot changes svh. */}
      <motion.div {...fade(settled, 0.2)} data-wash className="pointer-events-none absolute inset-x-0 bottom-0 h-[clamp(0px,calc(50%_-_13rem),18rem)]">
        <DitherGradient from={BRAND} opacity={0.25} />
      </motion.div>
      <motion.nav {...fade(settled, 0.35)} aria-label="Made by Smit" className="absolute bottom-2 left-2 z-10 flex gap-2">
        {SOCIALS.map((s) => (
          <a key={s.href} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} title={s.label} className={LINK}>
            <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
              <path d={s.path} />
            </svg>
            <span className="hidden sm:inline">{s.handle}</span>
          </a>
        ))}
      </motion.nav>
      {children}
    </div>
  );
}
