# Drives the pages of Merge Odds like a visitor, in a browser tab of its own, and saves proof.
# Run from the web/ folder, after `app.mjs launch`, with the Bash tool:
#   JOURNEY=check REPO=honojs/hono browser-use < .claude/skills/verify-merge-odds/scripts/ui.py
#   JOURNEY=how   browser-use < .claude/skills/verify-merge-odds/scripts/ui.py
#   JOURNEY=error browser-use < .claude/skills/verify-merge-odds/scripts/ui.py
#   JOURNEY=motion REPO=vitejs/vite browser-use < .claude/skills/verify-merge-odds/scripts/ui.py
# Options, all environment variables:
#   ENTRY  how the visitor gets there. check: button (default), enter, example, link. how: home (default), direct.
#   REPO   the repo to check, as owner/name or a full github.com URL. ENTRY=example needs one of the three "Try" repos.
#   VIEW   desktop (default, 1280 wide) or phone (390 wide, and the page must not scroll sideways).
#   PART   for motion: loading, exits, pages, avatar or tables. Leave it out to run all five in that order.
# browser-use runs this file with its helpers already imported (new_tab, js, cdp, fill_input, click_at_xy, ...).
# It prints one JSON result, saves the same under <evidence>/ui/, and exits 1 when "problems" is not empty.
import json, os, re, time

run = json.load(open(".verify/run.json", encoding="utf-8"))
URL = run["url"]
OUT = os.path.join(run["evidence"], "ui")
os.makedirs(OUT, exist_ok=True)
JOURNEY = os.environ.get("JOURNEY", "check")
REPO = os.environ.get("REPO", "honojs/hono")
ENTRY = os.environ.get("ENTRY", "")
VIEW = os.environ.get("VIEW", "desktop")
PART = os.environ.get("PART", "")
WIDTH, HEIGHT = (390, 844) if VIEW == "phone" else (1280, 900)
PREFIX = "-".join(x for x in [JOURNEY, ENTRY, PART, VIEW if VIEW != "desktop" else ""] if x)

INPUT = 'input[aria-label="GitHub repo"]'
SUBMIT = 'button[type="submit"]'  # the "Check" button
ALERT = '[role="alert"]'
VERDICTS = ["Closed door", "Go for it", "Worth a shot", "Tough crowd", "Too quiet to call", "Archived", "No pulse"]
SCORECARD = ["Newcomer merge rate", "First reply", "Time to merge", "Left hanging", "They say why", "Contributing guide"]
STEPS = ["Fetch the repo", "Split staff from outsiders", "Find the newcomers", "Ask Jev", "Do the sum", "Grade and decide"]

problems = []
saved = []


def need(ok, what):
    if not ok:
        problems.append(what)


def save(name, content):
    path = os.path.join(OUT, name)
    open(path, "w", encoding="utf-8").write(content)
    saved.append(path)


def shot(name):
    path = os.path.join(OUT, name)
    try:
        capture_screenshot(path, full=True)
        saved.append(path)
    except Exception as e:  # a hidden tab can refuse to paint: say so, never pass without the picture
        problems.append("no screenshot %s: %s" % (name, e))


def until(expr, seconds, what):
    end = time.time() + seconds
    while time.time() < end:
        value = js(expr)
        if value:
            return value
        time.sleep(0.4)
    raise RuntimeError("timed out after %ds waiting for %s" % (seconds, what))


AIM = [1.0]  # where the page sees a pointer, relative to where we send it. A page zoom moves phone-mode clicks.


def calibrate():
    js("window.__m = null; addEventListener('mousemove', (e) => { window.__m = e.clientX; }, { once: true, capture: true }); true")
    cdp("Input.dispatchMouseEvent", type="mouseMoved", x=200, y=200)
    time.sleep(0.3)
    seen = js("window.__m")
    AIM[0] = seen / 200.0 if seen else 1.0


def click(selector):
    spot = js("(() => { const e = document.querySelector(%s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()" % json.dumps(selector))
    if not spot:
        raise RuntimeError("nothing matches " + selector)
    click_at_xy(spot[0] / AIM[0], spot[1] / AIM[0])


def click_text(tag, text):
    spot = js("(() => { const e = [...document.querySelectorAll(%s)].find((x) => x.innerText.trim() === %s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()" % (json.dumps(tag), json.dumps(text)))
    if not spot:
        raise RuntimeError("no <%s> reads %s" % (tag, text))
    click_at_xy(spot[0] / AIM[0], spot[1] / AIM[0])


def fits():
    need(js("document.documentElement.scrollWidth <= window.innerWidth"), "the page scrolls sideways at %dpx" % WIDTH)


def settle(selector, seconds=12):
    # the page slides between layouts with a spring: wait until the element has stopped moving
    last, same, end = None, 0, time.time() + seconds
    while time.time() < end and same < 3:
        now = js("(() => { const e = document.querySelector(%s); return e ? Math.round(e.getBoundingClientRect().bottom + window.scrollY) : null; })()" % json.dumps(selector))
        same = same + 1 if now is not None and now == last else 0
        last = now
        time.sleep(0.4)
    need(same >= 3, "%s was still moving after %ds" % (selector, seconds))


def above_wash(selector, what):
    # the page rule: no text on the red dither wash at the bottom. Returns the gap in px, text bottom to wash top.
    gap = js("(() => { const e = document.querySelector(%s); const w = document.querySelector('[data-wash]'); if (!e || !w) return null; return Math.round(w.getBoundingClientRect().top - (e.getBoundingClientRect().bottom - parseFloat(getComputedStyle(e).paddingBottom))); })()" % json.dumps(selector))
    need(gap is not None and gap >= 0, "%s sits on the dither wash (gap %s px)" % (what, gap))
    return gap


def page_text():
    return js("document.body.innerText")


def submit(text):
    fill_input(INPUT, text)
    click(SUBMIT)


def scroll_through():
    # scroll-triggered parts only start once they are on screen
    total = js("document.documentElement.scrollHeight")
    y = 0
    while y < total:
        js("window.scrollTo(0, %d)" % y)
        time.sleep(0.9)
        y += 360
    js("window.scrollTo(0, document.documentElement.scrollHeight)")
    time.sleep(1.5)


def check():
    until("!!document.querySelector(%s)" % json.dumps(INPUT), 20, "the repo box")
    home = page_text()
    need("Will they merge your PR?" in home, "the home page has no headline")
    save(PREFIX + "-1-home.txt", home)
    entry = ENTRY or "button"
    if entry == "link":
        goto_url(URL + "/?repo=" + REPO)
        wait_for_load()
    elif entry == "example":
        click_text("button", REPO)
    elif entry == "enter":
        fill_input(INPUT, REPO)
        press_key("Enter")
    elif entry == "button":
        submit(REPO)
    else:
        raise RuntimeError("ENTRY for check is button, enter, example or link")
    # <main data-state> names the state of the check: idle, pending, loading, done or error (shared/check.ts)
    done = until("(() => { const s = document.querySelector('main').dataset.state; return s === 'done' || s === 'error' ? s : null; })()", 90, "the check to end")
    if done == "done":
        # the state turns to done first; the report replaces the fading loading view up to half a second later
        until("!!document.querySelector('footer')", 10, "the report to replace the loading view")
    report = page_text()
    save(PREFIX + "-2-report.txt", report)
    time.sleep(1.5)  # entrance animation and charts
    shot(PREFIX + "-3-report.png")
    need(done == "done", "the check ended in the state %s: %s" % (done, js("document.querySelector(%s) ? document.querySelector(%s).innerText : ''" % (json.dumps(ALERT), json.dumps(ALERT)))))
    name = REPO.replace("https://github.com/", "").strip("/")
    need(name.lower() in report.lower(), "the report does not show the repo name")
    need("repo=" in js("location.search"), "the address bar has no ?repo= after the check")
    verdict = next((v for v in VERDICTS if v in report), None)
    need(verdict, "no known verdict title on the page")
    for label in SCORECARD:
        need(label in report, "scorecard row missing: " + label)
    footer = js("document.querySelector('footer') ? document.querySelector('footer').innerText : ''")
    need(re.search(r"Checked (today|\d+ days? ago)\. Read \d+ PRs? and answered \d+ questions? about them in [\d.]+s", footer), "footer reads: " + footer)
    need(not re.search(r"\bjev\b|typesafe", report, re.I), "the report names the engine")
    fits()
    gap = above_wash("footer", "the report footer")
    address = js("location.href")
    # the Merge Odds link at the top of a report goes back to the home page with an empty repo box
    need(js("!!document.querySelector('main a[href=\"/\"]')"), "the report has no home link")
    js("window.scrollTo(0, 0)")
    time.sleep(0.5)
    click('main a[href="/"]')
    back = until("document.querySelector('main').dataset.state === 'idle' ? location.pathname + location.search : null", 10, "the home page after the home link")
    need(back == "/", "the home link ended on %s" % back)
    need(js("document.querySelector(%s).value" % json.dumps(INPUT)) == "", "the repo box is not empty after the home link")
    try:  # the link fades out for 150 ms before it leaves, and a hidden tab can stretch that to a second
        until("!document.querySelector('main a[href=\"/\"]')", 6, "the home link to leave the home page")
    except RuntimeError as e:
        problems.append(str(e))
    return {"entry": entry, "verdict": verdict, "footer": footer.strip(), "gapAboveWash": gap, "address": address, "home": back}


def how():
    entry = ENTRY or "home"
    if entry == "direct":
        goto_url(URL + "/how")
        wait_for_load()
    elif entry == "home":
        until("!!document.querySelector('a[href=\"/how\"]')", 20, "the How it works link")
        click('a[href="/how"]')
    else:
        raise RuntimeError("ENTRY for how is home or direct")
    until("location.pathname === '/how' && !!document.querySelector('h1')", 20, "the How it works page")
    scroll_through()
    text = page_text()
    save(PREFIX + "-1-page.txt", text)
    shot(PREFIX + "-2-page.png")
    need("How it works" in text, "no page title")
    for i, title in enumerate(STEPS):
        need(title in text, "step %d missing: %s" % (i + 1, title))
    for row in ["Rules", "Requirements", "Quotes", "PR kinds", "Close reasons"]:
        need(row in text, "request table row missing: " + row)
    # Keep this file ASCII and build other characters with chr(): on Windows browser-use garbles both a literal
    # division sign and its backslash-u escape when it reads the script from stdin.
    need("(26 + 1) %s (93 + 2)" % chr(247) in text, "the sum is missing")
    # the outcome table of step 3 comes from shared/outcomes.ts: six rows, the last one for PRs still open
    need("Closed by commit, as merge bots do" in text and "Still open past the deadline" in text, "the outcome table is missing")
    need("Not counted" in text, "the outcome table does not say that PRs the author closed are not counted")
    need("28%" in text, "the sum does not end on 28%: the count-up did not run")
    need("Someone else fixed it" in text, "the example answer is missing")
    fits()
    if entry == "direct":
        click_text("button", "Check repos")  # the button at the end of the page
    else:
        js("window.scrollTo(0, 0)")
        time.sleep(0.5)
        click('header a[href="/"]')  # the link at the top
    until("location.pathname === '/' && !!document.querySelector(%s)" % json.dumps(INPUT), 20, "the home page after Check repos")
    return {"entry": entry, "steps": len([s for s in STEPS if s in text]), "back": js("location.pathname")}


def error():
    until("!!document.querySelector(%s)" % json.dumps(INPUT), 20, "the repo box")
    seen = {}
    for text, want in [("not a repo", "Paste a GitHub repo, like facebook/react"), ("octocat/this-repo-does-not-exist-zz9", "Can't find that repo. Is it public?")]:
        submit(text)
        try:
            until("(() => { const a = document.querySelector(%s); return !!a && a.innerText.trim() === %s; })()" % (json.dumps(ALERT), json.dumps(want)), 30, "the message for " + text)
        except RuntimeError as e:
            problems.append(str(e))
        seen[text] = js("document.querySelector(%s) ? document.querySelector(%s).innerText : null" % (json.dumps(ALERT), json.dumps(ALERT)))
    settle(ALERT)  # the page slides back to the centre and the loading text fades out
    time.sleep(0.5)
    text = page_text()
    save(PREFIX + "-1-page.txt", text)
    shot(PREFIX + "-2-page.png")
    need("Will they merge your PR?" in text, "the headline left the page after an error")
    need(not js("!!document.querySelector('footer')"), "a report footer is on the page after an error")
    need(js("document.querySelector('main').dataset.state") == "error", "the state name is not error after an error")
    fits()
    gap = above_wash(ALERT, "the error message")
    return {"messages": seen, "gapAboveWash": gap}


# ---- motion: the five places where something moves on purpose. A part fails when the motion is missing, not
# only when the element is.
# How it reads motion: this tab is hidden, and a hidden tab moves its animations on about once a second, so the
# values on screen jump and a 150 ms fade is easy to miss. The browser still keeps one record per running animation
# (element.getAnimations()): what it changes, for how long, how often. Those records are exact, so the parts read
# them, about 40 times a second, from this script. ----

# per element: [opacity, stage or text, [[duration ms, "endless" or repeat count, delay ms, properties, opacity keyframes, easing], ...]]
SNAP = """(() => { const skip = ['offset', 'easing', 'composite', 'computedOffset'];
  const anim = (a) => { const t = a.effect.getComputedTiming(), k = a.effect.getKeyframes();
    return [Math.round(t.duration), t.iterations === Infinity ? 'endless' : t.iterations, Math.round(t.delay),
      [...new Set(k.flatMap((f) => Object.keys(f)))].filter((x) => !skip.includes(x)).join(','), k.map((f) => f.opacity).join('>'),
      (t.easing === 'linear' && k[0] ? k[0].easing : t.easing) || '']; };
  const m = document.querySelector('main');
  return [m ? m.dataset.state || '' : '', [...document.querySelectorAll(%s)].map((e) => [+getComputedStyle(e).opacity, e.dataset.stage || e.innerText.trim().slice(0, 60), e.getAnimations().map(anim)])]; })()"""
BAD = "Paste a GitHub repo, like facebook/react"
HOME = 'main a[href="/"]'
EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"
EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)"


def snap(selector):
    return js(SNAP % json.dumps(selector)) or ["", []]


def poll(selector, seconds, stop=None):
    """[ms, state of the check, elements] about 40 times a second, for `seconds` or until stop(frames) is true."""
    frames, t0 = [], time.time()
    while time.time() - t0 < seconds:
        state, els = snap(selector)
        frames.append((int((time.time() - t0) * 1000), state, els))
        if stop and stop(frames):
            break
        time.sleep(0.025)  # each reading opens one connection: faster than this runs Windows out of ports
    return frames


def opacity_anims(els):
    return [a for e in els for a in e[2] if "opacity" in a[3].split(",")]


def fades_out(before, frames, what, ms=150):
    """It is whole before the action, then an opacity animation of `ms` runs it down to 0, then it is gone."""
    need(before[1] and before[1][0][0] >= 0.98 and not opacity_anims(before[1]), "%s was not at rest before the action" % what)
    fades = [a for _, _, els in frames for a in opacity_anims(els[:1]) if a[4].endswith(">0")]
    need(fades, "%s left with a hard cut: no fade to 0 ever ran on it" % what)
    need(not fades or abs(fades[0][0] - ms) <= 10, "%s fades for %s ms, expected %d" % (what, fades[0][0] if fades else None, ms))
    need(frames and not frames[-1][2], "%s is still on the page" % what)
    return {"fadeMs": fades[0][0] if fades else None, "easing": fades[0][5] if fades else None, "goneAfterMs": next((t for t, _, els in frames if not els), None)}


def gone_for(n):
    return lambda frames: len(frames) > n and all(not els for _, _, els in frames[-n:])


def wait_end():
    done = until("(() => { const s = document.querySelector('main').dataset.state; return s === 'done' || s === 'error' ? s : null; })()", 90, "the check to end")
    if done == "done":
        until("!!document.querySelector('footer')", 10, "the report to replace the loading view")
    return done


def go_home():
    goto_url(URL + "/")
    wait_for_load()
    until("!!document.querySelector(%s)" % json.dumps(INPUT), 20, "the repo box")
    time.sleep(1.2)  # the entrance


def motion_loading():
    """Row 1. The square of the current stage pulses without end, so a long check never looks frozen."""
    go_home()
    submit(REPO)
    frames = poll("[data-stage]", 90, lambda fr: fr[-1][1] in ("done", "error"))
    need(frames[-1][1] == "done", "the check ended in the state %s" % frames[-1][1])
    staged = [(t, els) for t, _, els in frames if len(els) == 4]
    if not staged:
        problems.append("the loading view never showed four [data-stage] squares")
        return {}
    for t, els in staged:
        if [x[1] for x in els].count("now") != 1:
            problems.append("at %d ms the squares were %s: one and only one must be the current stage" % (t, [x[1] for x in els]))
            break
    last = [(t, els) for t, els in staged if els[3][1] == "now"]
    span = last[-1][0] - last[0][0] if last else 0
    if span < 1000:
        problems.append("the last stage showed for %d ms, too short to judge: use a repo this copy has not stored and that takes over 5 seconds" % span)
        return {"lastStageMs": span}
    settled = [els for t, els in last if t - last[0][0] > 500]  # a square that just finished takes 200 ms to go solid
    pulses = [a for els in settled for a in opacity_anims(els[3:4])]
    need(pulses and len([els for els in settled if opacity_anims(els[3:4])]) == len(settled), "the current square has no running opacity animation: it sits still")
    pulse = pulses[0] if pulses else None
    need(pulse and pulse[1] == "endless", "the pulse of the current square stops after %s runs" % (pulse[1] if pulse else None))
    need(pulse and pulse[0] == 1200, "one pulse takes %s ms, expected 1200" % (pulse[0] if pulse else None))
    need(pulse and pulse[4] == "0.35>1>0.35", "the pulse runs through the opacities %s, expected 0.35>1>0.35" % (pulse[4] if pulse else None))
    # a finished square goes solid over 200 ms and then rests. In this hidden tab that short move can still be on
    # record a second later, so the rule is: nothing endless on it, and whatever runs on it ends at full opacity.
    done_anims = [a for els in settled for a in opacity_anims(els[:3])]
    need(all(a[1] != "endless" and a[4].endswith(">1") for a in done_anims), "a finished square still pulses, or is on its way to less than full opacity")
    need(all(e[0] > 0.95 for e in settled[-1][:3] if not opacity_anims([e])), "a finished square came to rest dimmed")
    return {"lastStageMs": span, "readings": len(settled), "pulse": {"ms": pulse[0], "repeats": pulse[1], "opacity": pulse[4], "easing": pulse[5]} if pulse else None}


def motion_exits():
    """Row 2. The home link and the error message fade out, like everything around them."""
    go_home()
    submit(REPO)
    need(wait_end() == "done", "no report to leave from")
    time.sleep(2.5)  # the link has faded in
    out = {}
    before = snap(HOME)
    click(HOME)
    out["homeLink"] = fades_out(before, poll(HOME, 6, gone_for(3)), "the home link")
    until("document.querySelector('main').dataset.state === 'idle'", 10, "the home page")
    time.sleep(1.5)

    submit("not a repo")
    until("(() => { const a = document.querySelector(%s); return !!a && a.innerText.trim() === %s; })()" % (json.dumps(ALERT), json.dumps(BAD)), 10, "the bad-input message")
    time.sleep(2.5)
    before = snap(ALERT)
    submit(REPO)  # stored by now, so the report comes back at once
    out["errorToReport"] = fades_out(before, poll(ALERT, 8, gone_for(3)), "the error message")
    need(wait_end() == "done", "no report after the error")

    go_home()
    submit("not a repo")
    until("(() => { const a = document.querySelector(%s); return !!a && a.innerText.trim() === %s; })()" % (json.dumps(ALERT), json.dumps(BAD)), 10, "the bad-input message")
    time.sleep(2.5)
    before = snap(ALERT)
    submit("octocat/this-repo-does-not-exist-zz9")
    frames = poll(ALERT, 30, lambda fr: bool(fr[-1][2]) and "find that repo" in fr[-1][2][-1][1] and fr[-1][2][-1][0] > 0.98)
    need(frames[-1][2] and "find that repo" in frames[-1][2][-1][1], "the second message never showed in full")
    # the first message counts as gone once no element shows its text
    old = [(t, s, [e for e in els if e[1] == BAD][:1]) for t, s, els in frames]
    old = old[:next((i for i, f in enumerate(old) if not f[2]), len(old) - 1) + 1]
    out["errorToError"] = fades_out(before, old, "the first message")
    return out


VT = """addEventListener('pagereveal', (e) => { window.__vt = !!e.viewTransition; if (!e.viewTransition) return;
  e.viewTransition.ready.then(() => { const c = getComputedStyle(document.documentElement, '::view-transition-new(root)');
    window.__vtCss = [c.animationDuration, c.animationTimingFunction]; }, () => { window.__vtCss = ['skipped', '']; }); });"""


def motion_pages():
    """Row 3. Home and How it works are two documents: the browser crossfades them."""
    cdp("Page.enable")
    script = cdp("Page.addScriptToEvaluateOnNewDocument", source=VT)
    out = {}
    try:
        go_home()
        for name, selector, path in [("homeToHow", 'a[href="/how"]', "/how"), ("howToHome", 'header a[href="/"]', "/")]:
            click(selector)
            until("location.pathname === %s && typeof window.__vt === 'boolean'" % json.dumps(path), 20, "the page %s to report how it was revealed" % path)
            ran = js("window.__vt")
            need(ran, "%s: the page changed with a hard cut, no crossfade ran" % name)
            css = None
            if ran:
                try:
                    css = until("window.__vtCss", 8, "the crossfade to start")
                except RuntimeError as e:
                    problems.append("%s: %s" % (name, e))
                need(css and css[0] == "0.2s", "%s: the crossfade takes %s, expected 0.2s" % (name, css[0] if css else None))
                need(css and css[1] == EASE_OUT, "%s: the crossfade eases with %s" % (name, css[1] if css else None))
            out[name] = {"crossfade": ran, "duration": css[0] if css else None, "easing": css[1] if css else None}
            time.sleep(2.0)
    finally:
        cdp("Page.removeScriptToEvaluateOnNewDocument", identifier=script["identifier"])
    return out


def motion_avatar():
    """Row 4. The repo avatar fades in when it arrives. This tab has the cache off, so it always has to arrive."""
    img = "main header img"
    goto_url(URL + "/?repo=" + REPO)
    frames = poll(img, 60, lambda fr: fr[-1][1] in ("done", "error") and bool(fr[-1][2]) and fr[-1][2][0][0] > 0.98 and not fr[-1][2][0][2] and len(fr) > 5)
    seen = [els[0] for _, _, els in frames if els]
    if not seen:
        problems.append("the report has no avatar")
        return {}
    fades = [a for e in seen for a in opacity_anims([e]) if a[4] == "0>1"]
    need(seen[0][0] < 0.05, "the avatar did not start hidden: its first opacity was %.2f" % seen[0][0])
    need(fades, "the avatar popped in: no fade from 0 to 1 ever ran on it")
    need(not fades or fades[0][0] == 200, "the avatar fades for %s ms, expected 200" % (fades[0][0] if fades else None))
    need(not fades or fades[0][5] == EASE_OUT, "the avatar's fade eases with %s" % (fades[0][5] if fades else None))
    need(seen[-1][0] > 0.98, "the avatar ended at opacity %.2f" % seen[-1][0])
    return {"readings": len(seen), "fadeMs": fades[0][0] if fades else None, "easing": fades[0][5] if fades else None}


def motion_tables():
    """Row 5. In the two tables where the first row that fits wins, the rows arrive in that order."""
    goto_url(URL + "/how")
    wait_for_load()
    until("!!document.querySelector('h1')", 20, "the How it works page")
    time.sleep(1.0)
    tables = js("document.querySelectorAll('[data-ordered]').length")
    need(tables == 2, "%s tables are marked [data-ordered], expected 2: the outcome table and the verdict table" % tables)
    if not tables:
        return {}
    rows = js("document.querySelector('[data-ordered]').querySelectorAll('[data-row]').length")
    sel = "[data-ordered] [data-row]"
    before = [x[0] for x in snap(sel)[1][:rows]]
    need(before and max(before) < 0.05, "the rows were on show before the table came on screen")
    js("document.querySelector('[data-ordered]').scrollIntoView({ block: 'center' })")
    frames = poll(sel, 8, lambda fr: len(fr) > 5 and all(e[0] > 0.98 and not e[2] for e in fr[-1][2][:rows]))
    need(all(e[0] > 0.98 for e in frames[-1][2][:rows]), "a row did not end fully shown")
    # each row's own fade: its length, and how long it waits before it starts
    fade = [next((a for _, _, els in frames for a in opacity_anims(els[k:k + 1]) if a[4] == "0>1"), None) for k in range(rows)]
    if None in fade:
        problems.append("row %d never ran a fade from 0 to 1" % (fade.index(None) + 1))
        return {"rows": rows}
    waits = [a[2] for a in fade]
    need(all(a[0] == 300 for a in fade), "the rows fade for %s ms, expected 300 each" % [a[0] for a in fade])
    need(waits == [40 * k for k in range(rows)], "the rows wait %s ms before they start, expected 40 ms more for each row down" % waits)
    return {"rows": rows, "fadeMs": fade[0][0], "waitsMs": waits, "easing": fade[0][5]}


MOTION = {"loading": motion_loading, "exits": motion_exits, "pages": motion_pages, "avatar": motion_avatar, "tables": motion_tables}


def motion():
    if PART and PART not in MOTION:
        raise RuntimeError("PART for motion is one of: " + ", ".join(MOTION))
    out = {}
    for name in [PART] if PART else list(MOTION):
        before = len(problems)
        try:
            out[name] = MOTION[name]()
        except Exception as e:
            problems.append("%s: %s: %s" % (name, type(e).__name__, e))
        for i in range(before, len(problems)):
            if not problems[i].startswith(name + ": "):
                problems[i] = "%s: %s" % (name, problems[i])
    return {"parts": out}


tab = new_tab(URL + "/")
result = {"journey": JOURNEY, "view": VIEW, "url": URL}
try:
    wait_for_load()
    cdp("Emulation.setDeviceMetricsOverride", width=WIDTH, height=HEIGHT, deviceScaleFactor=1, mobile=VIEW == "phone")
    # A page zoom saved for this host changes the size a desktop page sees. Phone emulation ignores that zoom.
    zoom = 1.0 if VIEW == "phone" else js("window.innerWidth") / float(WIDTH)
    if abs(zoom - 1) > 0.02:
        cdp("Emulation.setDeviceMetricsOverride", width=int(round(WIDTH / zoom)), height=int(round(HEIGHT / zoom)), deviceScaleFactor=1, mobile=VIEW == "phone")
    cdp("Emulation.setFocusEmulationEnabled", enabled=True)  # lets a background tab animate and paint
    # the API lets the browser keep each result for one hour, and a new launch on the same port has the same address,
    # so without this the page can show the numbers of an older build
    cdp("Network.enable")
    cdp("Network.setCacheDisabled", cacheDisabled=True)
    js("location.reload()")
    wait_for_load()
    calibrate()
    result.update({"check": check, "how": how, "error": error, "motion": motion}[JOURNEY]())
except Exception as e:
    problems.append("%s: %s" % (type(e).__name__, e))
finally:
    try:
        cdp("Emulation.setFocusEmulationEnabled", enabled=False)
        cdp("Emulation.clearDeviceMetricsOverride")
        close_tab(tab)
    except Exception:
        pass

result.update({"saved": saved, "problems": problems})
open(os.path.join(OUT, "%s-result.json" % PREFIX), "w", encoding="utf-8").write(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
if problems:
    raise SystemExit(1)
