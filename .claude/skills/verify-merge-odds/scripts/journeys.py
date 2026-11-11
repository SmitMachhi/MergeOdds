# Part of ui.py, which runs it with its own helpers and settings. Not a script on its own.
# The check, how and error journeys.


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
        click('header a[href="/"]')  # the Merge Odds link at the top left
    until("location.pathname === '/' && !!document.querySelector(%s)" % json.dumps(INPUT), 20, "the home page after leaving /how")
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
