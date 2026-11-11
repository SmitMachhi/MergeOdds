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

// The How it works page: the check as one story in six steps, with the numbers from our Vite check (how-visuals.tsx).
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
          <SourceLink />
        </header>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={enter} className="pt-12 pb-8">
          <h1 className="text-4xl font-medium tracking-tight sm:text-6xl">How it works</h1>
          <div className="mt-4 max-w-prose space-y-4 leading-7 text-pretty text-muted-foreground">
            <p>
              You want to send your first pull request (PR) to some repo. Will the maintainers merge it? You cannot know for
              sure. But the repo's recent past shows what happened to people like you: people who sent their first PR there.
              Merge Odds reads that past and turns it into odds, in 4 to 7 seconds.
            </p>
            <p>Each step below says what we do and why. Lines marked Example show real numbers from our check of {EX.repo} on 10 November 2026.</p>
          </div>
        </motion.div>

        <Rule2 />
        <Step
          n={1}
          title="Read the recent PRs"
          visual={<PixelGrid mode="read" />}
          lead="We ask GitHub for the newest PRs that are merged or closed. We also read the docs where the repo sets its rules for contributors."
          caption={`Example: squares are ${EX.name}'s PRs, green merged, red closed`}
          facts={[
            ["PRs", "Up to 200 merged and 200 closed, from the last 90 days at most"],
            ["Docs", "CONTRIBUTING.md, AI_POLICY.md, the PR template and the workflow files"],
            ["Example", `${EX.name}: ${READ} PRs, ${EX.read.merged} merged and ${EX.read.closed} closed, from the last ${EX.days} days`],
          ]}
        />
        <Rule2 />
        <Step
          n={2}
          title="Keep the outside PRs"
          visual={<PixelGrid mode="outside" />}
          lead="Maintainers merge their own work, so their PRs say little about your chances. Bots tell us nothing either. We keep PRs from outsiders: people who are not staff and not bots."
          caption="Example: outside PRs stay lit"
          facts={[
            ["Staff", "Anyone who merged PRs here, and anyone GitHub lists as owner, member or collaborator"],
            ["Example", `${EX.name}: ${EX.outside.merged + EX.outside.closed} outside PRs, ${EX.outside.merged} merged and ${EX.outside.closed} closed`],
          ]}
        />
        <Rule2 />
        <Step
          n={3}
          title="Read why PRs closed"
          lead="GitHub shows that PRs closed, but not why. Maybe the maintainers said no. Maybe the author gave up, or someone else fixed the problem first. The last comments on each PR hold the answer, so we give those comments to Jev."
          visual={<Question />}
          facts={[
            ["Jev", "TypeSafe's classifier. It reads text, picks answers from fixed lists and says how sure it is. It writes no text, so it cannot invent answers"],
            ["Yes", "We count yes when Jev is 70% sure or more"],
            ["Docs", "Jev also reads the contributor docs: what rules they set, and how clear they are"],
            ["PR titles", "Jev sorts PRs by kind of change, such as bug fixes or docs, to show which kinds get merged"],
          ]}
        >
          <p className="mb-3 text-xs text-muted-foreground">Example: {EX.name} took 5 requests and {QUESTIONS} questions</p>
          <Table head={["Request", "Jev reads", "We ask", "Questions"]} rows={REQUESTS.map((r) => [r.name, r.reads, r.asks, r.count])} cols="md:grid-cols-[9rem_1fr_1fr_5rem]" />
        </Step>
        <Rule2 />
        <Step
          n={4}
          title="Sort the newcomers"
          visual={<Outcomes />}
          lead="You are new to the repo, so we look at people who were new too: outsiders with no merged PR here before the days we read in step 1. We call them newcomers. Their PRs ended merged, rejected or stuck."
          caption={`Example: ${EX.name}, ${TRIED} newcomers`}
          facts={[
            ["How we know", "We search GitHub for each author's earlier merged PRs"],
            ["Stuck", `We also ask GitHub for PRs still open after the time 9 in 10 merged outside PRs took. By then, most PRs that get merged are merged. Example: ${EX.stuckAfterDays} days for ${EX.name}`],
            ["Not counted", "PRs the author closed. The maintainers made no choice on those"],
            ["Once each", `Each person counts once, with their best result: ${BEST_FIRST[0]} beats ${BEST_FIRST[1]}, ${BEST_FIRST[1]} beats ${BEST_FIRST[2]}`],
          ]}
        >
          <p className="mb-3 text-xs text-muted-foreground">We test each PR against these rows, top to bottom. The first row that fits sets its group.</p>
          <Table compact ordered head={["How the PR ended", "Group", "Source"]} rows={OUTCOME_ROWS} cols="md:grid-cols-[1fr_8rem_6rem]" />
        </Step>
        <Rule2 />
        <Step
          n={5}
          title="Work out the odds"
          lead="The odds are the share of newcomers whose PR got merged. Small numbers can mislead: 3 merged out of 3 tried reads as 100%. So we add 1 to merged and 2 to tried before we divide. With many newcomers, this changes little. With few, it keeps the odds away from 0% and 100%."
          visual={<Sum />}
          facts={[
            ["Formula", "(merged + 1) ÷ (tried + 2)"],
            ["Range", `We are 90% sure the true odds sit inside this range (Wilson interval). Example: ${EX.range[0]}% to ${EX.range[1]}% for ${EX.name}`],
            ["Too few", "Under 3 newcomers, we show no odds"],
          ]}
        />
        <Rule2 />
        <Step
          n={6}
          title="Grade the repo"
          lead="The odds say if you get in. They do not say how the maintainers treat you on the way: how fast they reply, or if they say why they turn PRs down. Grades from A to F cover that. The verdict at the top of the report gives you the short answer."
          visual={<Grades />}
          caption={`Example: ${EX.name}'s grades`}
          facts={[
            ["Merge rate", "The odds from step 5"],
            ["First reply", "Half of outside PRs got their first human reply within this time"],
            ["Time to merge", "Half of merged outside PRs got merged within this time"],
            ["Left hanging", "Share of outside PRs left open past the deadline from step 4"],
            ["They say why", "Share of rejected PRs where the maintainers gave their reason"],
            ["Guide", "How clear the docs are on getting PRs merged, from 0 to 100"],
          ]}
        >
          <p className="mb-3 text-xs text-muted-foreground">The first table sets the bar for each grade. Past the D bar is F. The second table picks the verdict: the first row that fits wins. Plain code picks both, not Jev.</p>
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
