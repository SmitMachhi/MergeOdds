import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { DitherButton } from "@/components/dither-kit";
import { Frame } from "@/components/frame";
import { PrMark } from "@/components/pr-mark";
import { Report } from "@/components/report";
import { BRAND, fetchAnalysis } from "@/lib/ui";
import { useSettled } from "@/lib/use-settled";
import { cn } from "@/lib/utils";
import { next, parseRepo, start, stateName } from "../shared/check";

const EXAMPLES = ["vitejs/vite", "facebook/react", "honojs/hono"];
const STAGES = ["Reading recent pull requests", "Finding the newcomers", "Reading the contributing guide", "Working out the odds"];

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };
/** The page-load entrance: the same rise as the report cards. `custom` is the element's place in the order. */
const rise = {
  hidden: { opacity: 0, y: 14, filter: "blur(4px)" },
  show: (i: number) => ({ opacity: 1, y: 0, filter: "blur(0px)", transition: { ...spring, delay: i * 0.06 } }),
};
/** The headline and the examples leave and come back with a short fade. They start from `hidden` on page load only:
 *  `swap` has no `hidden` of its own, so that label passes through to the children, which rise one after another. */
const swap = {
  quick: { opacity: 0, transition: { duration: 0.15 } },
  show: { opacity: 1, transition: { duration: 0.15 } },
};

/** How the home link and the error message leave: the same short fade as the headline, so nothing cuts out. */
const LEAVE = { opacity: 0, transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] as const } };

/** An answer faster than this never shows the loading view: stored results and bad input come back at once. */
const SLOW_MS = 200;

function Loading({ repo }: { repo: string }) {
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

export default function App() {
  const [input, setInput] = useState("");
  // shared/check.ts holds every state and every move of a check. This component sends it events and draws its view.
  const [check, send] = useReducer(next, null, () => start(new URLSearchParams(location.search).get("repo")));
  const view = check.view;
  const abort = useRef<AbortController | null>(null);
  const requests = useRef(0);
  const box = useRef<HTMLInputElement>(null);
  // The entrance plays once, on page load, and waits until the page has settled. After that, parts that come back
  // start from the short fade.
  const settled = useSettled();
  const enter = settled ? "quick" : "hidden";
  const shown = settled ? "show" : "hidden";

  const run = useCallback(async (text: string, push = true) => {
    const clean = text.trim();
    if (!clean) return;
    abort.current?.abort(); // a new submit replaces the request in flight
    setInput(clean);
    if (!parseRepo(clean)) return send({ type: "invalid" });
    const ctl = (abort.current = new AbortController());
    const id = ++requests.current;
    send({ type: "submit", id, repo: clean });
    if (push) history.pushState(null, "", `?repo=${encodeURIComponent(clean)}`);
    const slow = setTimeout(() => send({ type: "slow", id }), SLOW_MS);
    try {
      send({ type: "resolved", id, data: await fetchAnalysis(clean, ctl.signal) });
    } catch (e) {
      if (!ctl.signal.aborted) send({ type: "rejected", id, message: (e as Error).message });
    } finally {
      clearTimeout(slow);
    }
  }, []);

  // The address is the source of truth on load and on Back and Forward.
  useEffect(() => {
    const fromUrl = () => {
      const repo = new URLSearchParams(location.search).get("repo");
      if (repo) return void run(repo, false);
      abort.current?.abort();
      send({ type: "reset" });
    };
    fromUrl();
    addEventListener("popstate", fromUrl);
    return () => removeEventListener("popstate", fromUrl);
  }, [run]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(input);
  };
  const idle = view.status === "idle" || view.status === "error";
  /** Back to the home page with no page load. A click with a modifier key keeps the browser's own behaviour. */
  const goHome = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    abort.current?.abort();
    history.pushState(null, "", "/");
    setInput("");
    send({ type: "reset" });
    box.current?.focus();
  };

  return (
    <Frame>
      <main data-state={stateName(check)} className="relative mx-auto flex min-h-svh max-w-5xl flex-col px-4">
        <motion.div layout transition={spring} className={cn("relative", idle ? "my-auto py-16" : "pt-6 pb-8")}>
          {/* The way home from a report. Beside the repo box on a wide screen, in a row of its own above it on a narrow one. */}
          <AnimatePresence mode="popLayout">
            {!idle && (
              <motion.a key="home" href="/" onClick={goHome} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.3, delay: 0.2 } }} exit={LEAVE} className="mb-3 inline-flex h-8 items-center gap-2 text-sm font-medium lg:absolute lg:top-6 lg:left-0 lg:mb-0 lg:h-[3.125rem]">
                <img src="/favicon.svg" alt="" className="size-4" />
                Merge Odds
              </motion.a>
            )}
          </AnimatePresence>
          <AnimatePresence mode="popLayout">
            {idle && (
              <motion.div key="hero" variants={swap} initial={enter} animate={shown} exit="quick" className="relative text-center">
                {/* The icon and the link sit above the headline without pushing it down, so the centred block and the wash
                    maths stay as they are. The icon scales with the screen height and hides when there is no room for it.
                    The link stays, because it is the only way to the How it works page. */}
                <div className="absolute bottom-full left-1/2 mb-6 flex -translate-x-1/2 flex-col items-center gap-3">
                  <motion.div variants={rise} custom={0} className="size-[clamp(6rem,15svh,11rem)] sm:size-[clamp(6rem,19svh,12rem)] [@media(max-height:640px)]:hidden sm:[@media(max-height:700px)]:hidden">
                    <PrMark className="block size-full" />
                  </motion.div>
                  <motion.a variants={rise} custom={1} href="/how" className="text-sm whitespace-nowrap text-emerald-400 underline decoration-emerald-400/30 underline-offset-4 transition-colors hover:text-emerald-300 hover:decoration-emerald-300/70">
                    How it works?
                  </motion.a>
                </div>
                <motion.h1 variants={rise} custom={2} className="text-4xl font-medium tracking-tight text-balance sm:text-6xl">Will they merge your PR?</motion.h1>
                <motion.p variants={rise} custom={3} className="mx-auto mt-4 max-w-xl pb-8 text-balance text-muted-foreground">
                  We read the repo's history and tell you how likely your PR is to get merged.
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.form layout="position" variants={rise} custom={4} initial="hidden" animate={shown} transition={spring} onSubmit={submit} className="mx-auto flex max-w-xl items-center gap-2 rounded-xl border bg-card p-1 pl-4 focus-within:ring-2 focus-within:ring-ring/40">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="GitHub repo URL"
              aria-label="GitHub repo"
              ref={box}
              autoFocus
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <DitherButton type="submit" color={BRAND} variant="gradient" disabled={check.pending !== null} className="h-10 rounded-lg px-5 text-sm font-medium transition-transform active:scale-[0.97]">
              Check
            </DitherButton>
          </motion.form>
          <AnimatePresence mode="popLayout">
            {idle && (
              <motion.div key="examples" variants={swap} initial={enter} animate={shown} exit="quick">
                <motion.p variants={rise} custom={5} className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  Try
                  {EXAMPLES.map((r) => (
                    <button key={r} type="button" onClick={() => run(r)} className="underline decoration-white/20 underline-offset-4 transition-colors hover:text-foreground hover:decoration-white/60">
                      {r}
                    </button>
                  ))}
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
          {/* keyed by its text: one message fades out before the next one comes in */}
          <AnimatePresence mode="wait">
            {view.status === "error" && (
              <motion.p key={view.message} role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={LEAVE} className="mt-4 text-center text-sm text-red-400">
                {view.message}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence mode="wait">
          {view.status === "loading" && <Loading key="loading" repo={view.repo} />}
          {view.status === "done" && <Report key={view.data.repo.name + view.data.generatedAt} a={view.data} />}
        </AnimatePresence>
      </main>
    </Frame>
  );
}
