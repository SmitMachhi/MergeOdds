# Drives the pages of Merge Odds like a visitor, in a browser tab of its own, and saves proof.
# Run from the repo's root folder, after `app.mjs launch`, with the Bash tool:
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


# The journeys live next to this file, one idea per file. They run inside this script, so they share its helpers.
HERE = ".claude/skills/verify-merge-odds/scripts"
for part in ["motion_live.py", "motion_pages.py"] if JOURNEY == "motion" else ["journeys.py"]:
    exec(open(os.path.join(HERE, part), encoding="utf-8").read())


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
