# Part of ui.py, which runs it with its own helpers and settings. Not a script on its own.
# The motion parts that need no check: the page crossfade, the avatar fade-in and the ordered table rows.

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
