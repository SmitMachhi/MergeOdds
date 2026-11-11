import { motion } from "motion/react";
import { DitherButton } from "@/components/dither-kit";
import { Frame } from "@/components/frame";
import { Rule2 } from "@/components/card";
import { SourceLink } from "@/components/source-link";
import { enter, Reveal, Step, Table } from "@/components/how-layout";
import { EX, Grades, Outcomes, PixelGrid, Question, READ, Sum, TRIED } from "@/components/how-visuals";
import { BRAND } from "@/lib/ui";
import { BEST_FIRST, OUTCOMES } from "../../shared/outcomes";
import { CUTS, VERDICTS } from "../../shared/rules";

// The How it works page: the check in six steps, with the numbers from our Vite check (how-visuals.tsx).
// This is the one page that names Jev: it exists to say how the app works.

// The five Jev requests of that check, with its question counts. Vite has no AI policy file and no workflow
// that closes PRs, so the rules request held 12 rule questions, not 14.
const REQUESTS = [
  { name: "Rules", reads: "The guide and the PR template", asks: "12 yes or no questions about rules, and 2 ratings", count: 14 },
  { name: "Requirements", reads: "120 lines from the guide", asks: "Must contributors do this? Which of 7 topics is it?", count: 240 },
  { name: "Quotes", reads: "The same 120 lines", asks: "Which of 12 rules does this line state, if any?", count: 120 },
  { name: "PR kinds", reads: "90 PR titles", asks: "Which of 6 kinds of change is it?", count: 90 },
  { name: "Close reasons", reads: "The newest 60 closed outside PRs: title, days open, who closed it, last 3 comments", asks: "Which of 8 reasons closed it?", count: 60 },
];
const QUESTIONS = REQUESTS.reduce((s, r) => s + r.count, 0);

// The tables come from shared/rules.ts and shared/outcomes.ts, the same ones the worker decides with, so this page
// cannot drift from the code.
const bar = (x: number, unit: string) => (unit === "%" ? `${x}%` : unit === "days" ? `${x}d` : unit === "hours" ? (x < 48 ? `${x}h` : `${x / 24}d`) : `${x}`);
const CUT_ROWS = Object.values(CUTS).map((c) => [c.label, ...c.cuts.map((x) => bar(x, c.unit)), c.more ? "or more" : "or less"]);
// In the order the code checks them: the first row that fits wins.
const VERDICT_ROWS = VERDICTS.map((v) => [v.title, v.when]);
const GROUP = { merged: "Merged", rejected: "Rejected", stuck: "Stuck" };
const SOURCE = { github: "GitHub", classifier: "Jev" };
const OUTCOME_ROWS = OUTCOMES.map((o) => [o.when, o.end ? GROUP[o.end] : "Not counted", SOURCE[o.by]]);

const LIMITS = [
  "On busy repos, the 400 PRs we read can span 2 days",
  "Under 10 newcomers, the range is wide",
  "On borderline cases, Jev's answer can change from run to run",
  "Jev reads the newest 60 closed outside PRs. Older PRs the author closed still count as rejected",
  "We keep each result for 7 days, so numbers can be 7 days old",
];

export function How() {
  return (
    <Frame>
      <main className="relative mx-auto max-w-5xl px-4 pb-56">
        <header className="flex h-16 items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-medium">
            <img src="/favicon.svg" alt="" className="size-4" />
            Merge Odds
          </a>
          <div className="flex items-center gap-5">
            <a href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Check repos</a>
            <SourceLink />
          </div>
        </header>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={enter} className="pt-12 pb-8">
          <h1 className="text-4xl font-medium tracking-tight sm:text-6xl">How it works</h1>
          <p className="mt-4 max-w-prose leading-7 text-pretty text-muted-foreground">
            Checks take 4 to 7 seconds. Lines marked Example come from our check of {EX.repo} on 10 November 2026.
          </p>
        </motion.div>

        <Rule2 />
        <Step
          n={1}
          title="Fetch the repo"
          visual={<PixelGrid mode="read" />}
          lead="We ask GitHub for recent pull requests and the contributor docs."
          caption="Example: squares are PRs, green merged, red closed"
          facts={[
            ["PRs", "Up to 200 merged and 200 closed, from the last 90 days at most"],
            ["Docs", "CONTRIBUTING.md, AI_POLICY.md, the PR template and the workflow files"],
            ["Example", `${EX.name}: ${READ} PRs, ${EX.read.merged} merged and ${EX.read.closed} closed, from the last ${EX.days} days`],
          ]}
        />
        <Rule2 />
        <Step
          n={2}
          title="Split staff from outsiders"
          visual={<PixelGrid mode="outside" />}
          lead="We keep PRs from outsiders and drop PRs from staff and bots."
          caption="Example: outside PRs stay lit"
          facts={[
            ["Staff", "Anyone who merged PRs here, and anyone GitHub lists as owner, member or collaborator"],
            ["Example", `${EX.name}: ${EX.outside.merged + EX.outside.closed} outside PRs, ${EX.outside.merged} merged and ${EX.outside.closed} closed`],
          ]}
        />
        <Rule2 />
        <Step
          n={3}
          title="Find the newcomers"
          visual={<Outcomes />}
          lead="Newcomers are outsiders with no merged PR here before the days we read. The table sorts their PRs into groups: the first row that fits wins."
          caption={`Example: ${EX.name}, ${TRIED} newcomers`}
          facts={[
            ["How we know", "We search GitHub for each author's earlier merged PRs"],
            ["Once each", `Each person counts once, with their best ending: ${BEST_FIRST[0]} beats ${BEST_FIRST[1]}, ${BEST_FIRST[1]} beats ${BEST_FIRST[2]}`],
            ["Not counted", "PRs the author closed. They say nothing about maintainers"],
            ["Stuck", `Open longer than 9 in 10 merged outside PRs took. Example: ${EX.stuckAfterDays} days for ${EX.name}`],
          ]}
        >
          <Table compact ordered head={["How the PR ended", "Group", "Source"]} rows={OUTCOME_ROWS} cols="md:grid-cols-[1fr_8rem_6rem]" />
        </Step>
        <Rule2 />
        <Step
          n={4}
          title="Ask Jev"
          lead="Some facts sit in text: the guide, and the last comments on closed PRs. Jev reads that text and answers fixed questions."
          visual={<Question />}
          facts={[
            ["Jev", "TypeSafe's classifier. It picks the answer and says how sure it is. It writes no text"],
            ["Questions", "Yes or no, multiple choice, or ratings"],
            ["Yes", "Counts when Jev is 70% sure or more"],
          ]}
        >
          <p className="mb-3 text-xs text-muted-foreground">Example: {EX.name} took 5 requests and {QUESTIONS} questions</p>
          <Table head={["Request", "Jev reads", "We ask", "Questions"]} rows={REQUESTS.map((r) => [r.name, r.reads, r.asks, r.count])} cols="md:grid-cols-[9rem_1fr_1fr_5rem]" />
        </Step>
        <Rule2 />
        <Step
          n={5}
          title="Do the sum"
          lead="The odds are the share of newcomers who got merged, adjusted for small samples."
          visual={<Sum />}
          facts={[
            ["Formula", "(merged + 1) ÷ (tried + 2). The +1 and +2 stop 3 lucky PRs from reading as 100%"],
            ["Range", `We are 90% sure the true odds sit inside it (Wilson interval). Example: ${EX.range[0]}% to ${EX.range[1]}%`],
          ]}
        />
        <Rule2 />
        <Step
          n={6}
          title="Grade and decide"
          lead="Fixed tables turn the numbers into grades and the verdict."
          visual={<Grades />}
          caption={`Example: ${EX.name}'s grades`}
          facts={[
            ["Grades", "The cut-off table. Past the D bar is F"],
            ["Verdict", "The verdict table. The first row that fits wins. Plain code picks it, not Jev"],
          ]}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
            <Table compact head={["Metric", "A", "B", "C", "D", ""]} rows={CUT_ROWS} cols="md:grid-cols-[7rem_1fr_1fr_1fr_1fr_4rem] md:gap-x-4" />
            <Table ordered head={["Verdict", "When"]} rows={VERDICT_ROWS} cols="md:grid-cols-[10rem_1fr]" />
          </div>
        </Step>
        <Rule2 />

        <section className="grid gap-x-16 gap-y-8 py-16 md:grid-cols-2">
          <Reveal>
            <h2 className="text-2xl font-medium tracking-tight">Limits</h2>
            <ul className="mt-6 space-y-3">
              {LIMITS.map((l) => (
                <li key={l} className="flex gap-3 text-sm text-pretty text-muted-foreground">
                  <span className="mt-1.5 size-2 shrink-0 bg-current" />
                  {l}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1} className="md:justify-self-end md:self-end">
            <DitherButton color={BRAND} onClick={() => location.assign("/")} className="h-12 rounded-lg px-6 text-sm font-medium transition-transform active:scale-[0.97]">
              Check repos
            </DitherButton>
          </Reveal>
        </section>
      </main>
    </Frame>
  );
}
