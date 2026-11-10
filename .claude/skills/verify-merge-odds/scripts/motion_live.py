# Part of ui.py, which runs it with its own helpers and settings. Not a script on its own.
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
