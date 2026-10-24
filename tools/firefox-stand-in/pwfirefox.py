"""pwfirefox: the small part of Playwright's Python API that this repository's browser tests use, driving stock Firefox through Selenium and geckodriver.
Part of JS-modules, https://github.com/lfcfoundry/JS-modules
Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).

Playwright cannot drive the Firefox you download from Mozilla (it needs its own patched build). This file offers the same calls for the common
cases, so a test written for Playwright can run in stock Firefox without being rewritten. Use run-in-firefox.py to run a test with it; read
README.md first to decide whether it fits the test at hand. Anything it cannot do raises NotImplementedError with a plain sentence, never a
silent wrong answer.

Environment: FIREFOX_PATH (default: "firefox" on the PATH) and GECKODRIVER_PATH (default: "geckodriver" on the PATH).
"""
import json, os, shutil, sys, time, urllib.parse

try:
    from selenium import webdriver
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.webdriver.common.actions.action_builder import ActionBuilder
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.firefox.options import Options
    from selenium.webdriver.firefox.service import Service
except ImportError:
    raise SystemExit("pwfirefox needs Selenium: pip install selenium (and Firefox plus geckodriver; see tools/firefox-stand-in/README.md)")

KEYS = {"Escape": Keys.ESCAPE, "Enter": Keys.ENTER, "Tab": Keys.TAB, "Backspace": Keys.BACKSPACE, "Delete": Keys.DELETE, "Space": " ",
        "ArrowUp": Keys.ARROW_UP, "ArrowDown": Keys.ARROW_DOWN, "ArrowLeft": Keys.ARROW_LEFT, "ArrowRight": Keys.ARROW_RIGHT,
        "Home": Keys.HOME, "End": Keys.END, "PageUp": Keys.PAGE_UP, "PageDown": Keys.PAGE_DOWN,
        "Shift": Keys.SHIFT, "Control": Keys.CONTROL, "Alt": Keys.ALT}
SUPPORTED = ("playwright.firefox.launch / chromium.launch (both start Firefox) with headless and executable_path; browser.new_context(viewport=...) / new_page() / close() / version; "
             "context.route (accepted, blocks nothing) / new_page() / close(); page.goto, set_content, evaluate, add_script_tag(content= or path=), wait_for_function, wait_for_timeout, title, url, "
             "inner_text(selector), click(selector), wait_for_selector(selector), on('pageerror') / on('console') / on('requestfailed'), keyboard.press / down / up, mouse.click / move, close")


def _no(what):
    raise NotImplementedError("pwfirefox does not support %s. It supports: %s. Run this test in Playwright's own browsers, or extend tools/firefox-stand-in/pwfirefox.py."
                              % (what, SUPPORTED))


class _Strict:
    def __getattr__(self, name):
        _no("%s.%s" % (type(self).__name__.lstrip("_").lower(), name))


class _Keyboard(_Strict):
    def __init__(self, d): self.d = d
    def _key(self, k): return KEYS.get(k, k)
    def press(self, combo):
        parts = combo.split("+") if len(combo) > 1 else [combo]
        a = ActionChains(self.d)
        for m in parts[:-1]: a.key_down(self._key(m))
        a.send_keys(self._key(parts[-1]))
        for m in reversed(parts[:-1]): a.key_up(self._key(m))
        a.perform()
    def down(self, k): ActionChains(self.d).key_down(self._key(k)).perform()
    def up(self, k): ActionChains(self.d).key_up(self._key(k)).perform()


class _Mouse(_Strict):
    def __init__(self, d): self.d = d
    def move(self, x, y):
        a = ActionBuilder(self.d); a.pointer_action.move_to_location(x, y); a.perform()
    def click(self, x, y):
        a = ActionBuilder(self.d); a.pointer_action.move_to_location(x, y); a.pointer_action.click(); a.perform()


class _Msg:
    """What Playwright's console handler receives: .type ('log', 'warning', 'error', 'info', 'debug') and .text."""
    def __init__(self, type, text): self.type = type; self.text = text
    def __repr__(self): return "<console %s %r>" % (self.type, self.text)


class _Req:
    """What Playwright's requestfailed handler receives: .url. Only a picture, script, style sheet, media file or frame that failed to load is seen."""
    def __init__(self, url): self.url = url
    def __repr__(self): return "<request failed %s>" % self.url


class _Page(_Strict):
    def __init__(self, d):
        self.d = d; self.keyboard = _Keyboard(d); self.mouse = _Mouse(d); self._err = None; self._con = None; self._rf = None
    def _world(self, src):
        """Run src as a script element, so it runs in the page's own world (Selenium's execute_script runs in an isolated sandbox where assignments to page globals do not reach the page)."""
        self.d.execute_script("var e=document.createElement('script');e.textContent=arguments[0];(document.head||document.documentElement).appendChild(e);e.remove()", src)
    def _listen(self):
        self._world("window.__pwErrs=[];window.addEventListener('error',function(e){window.__pwErrs.push(e.message)});"
                    "window.addEventListener('unhandledrejection',function(e){window.__pwErrs.push(String(e.reason))})")
    def _hook_console(self):
        """Wrap the page's console methods so messages made after this call reach on('console'). Messages printed while the page was loading are not seen."""
        self._world("if(!window.__pwCons){window.__pwCons=[];['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){"
                    "try{window.__pwCons.push([k==='warn'?'warning':k,Array.prototype.map.call(arguments,function(a){try{return typeof a==='string'?a:(a instanceof Error?String(a):JSON.stringify(a))}catch(e){return String(a)}}).join(' ')])}catch(e){}"
                    "return o.apply(console,arguments)}})}")
    def _hook_failed(self):
        self._world("if(!window.__pwFail){window.__pwFail=[];addEventListener('error',function(e){var t=e.target;if(t&&t!==window&&t.nodeType===1&&(t.src||t.href))window.__pwFail.push(t.src||t.href)},true)}")
    def _flush(self):
        if self._rf:
            self._world("document.documentElement.setAttribute('data-pw-f',JSON.stringify(window.__pwFail||[]));window.__pwFail=[]")
            for u in json.loads(self.d.execute_script("return document.documentElement.getAttribute('data-pw-f')") or "[]"): self._rf(_Req(u))
        if self._err:
            self._world("document.documentElement.setAttribute('data-pw-e',JSON.stringify(window.__pwErrs||[]));window.__pwErrs=[]")
            for e in json.loads(self.d.execute_script("return document.documentElement.getAttribute('data-pw-e')") or "[]"): self._err(e)
        if self._con:
            self._world("document.documentElement.setAttribute('data-pw-c',JSON.stringify(window.__pwCons||[]));window.__pwCons=[]")
            for t, x in json.loads(self.d.execute_script("return document.documentElement.getAttribute('data-pw-c')") or "[]"): self._con(_Msg(t, x))
    def goto(self, url, **k):
        self.d.get(url); self._listen()
        if self._con: self._hook_console()
        if self._rf: self._hook_failed()
    def set_content(self, html, **k): self.goto("data:text/html;charset=utf-8," + urllib.parse.quote(html))
    def evaluate(self, js, arg=None):
        """A string is an expression (several statements are fine, the last value is returned); a string that evaluates to a function is called with arg, like Playwright. Promises are awaited."""
        self.d.execute_script("document.documentElement.removeAttribute('data-pw-r')")
        self._world("(function(){var set=function(o){document.documentElement.setAttribute('data-pw-r',JSON.stringify(o))};try{var r=(0,eval)(%s);"
                    "if(typeof r==='function')r=r(%s);Promise.resolve(r).then(function(v){set({v:v===undefined?null:v})},function(e){set({e:String(e)+(e&&e.stack?'\\n'+e.stack:'')})})}"
                    "catch(e){set({e:String(e)+(e&&e.stack?'\\n'+e.stack:'')})}})()" % (json.dumps(js), json.dumps(arg)))
        end = time.time() + 30
        while True:
            r = self.d.execute_script("return document.documentElement.getAttribute('data-pw-r')")
            if r is not None: break
            if time.time() > end: raise TimeoutError("evaluate did not finish in 30 s: " + js[:80])
            time.sleep(0.005)
        self._flush(); r = json.loads(r)
        if "e" in r: raise RuntimeError(r["e"])
        return r["v"]
    def add_script_tag(self, content=None, path=None, **k):
        if k or (content is None) == (path is None): _no("add_script_tag(%s) (only content= or path=)" % ", ".join(sorted(k)))
        self._world(content if content is not None else open(path, encoding="utf-8").read())
    def wait_for_timeout(self, ms): time.sleep(ms / 1000.0); self._flush()
    def wait_for_selector(self, selector, timeout=30000, state="visible", **k):
        if k or state not in ("visible", "attached", "hidden", "detached"): _no("wait_for_selector(%s)" % ", ".join(sorted(k) + ["state=" + state]))
        end = time.time() + timeout / 1000.0
        while True:
            found = self.d.find_elements("css selector", selector)
            shown = any(e.is_displayed() for e in found)
            if (state == "visible" and shown) or (state == "attached" and found) or (state == "hidden" and not shown) or (state == "detached" and not found):
                self._flush(); return found[0] if found and state in ("visible", "attached") else None
            if time.time() > end: raise TimeoutError("wait_for_selector timed out: %s (%s)" % (selector, state))
            time.sleep(0.02)
    def wait_for_function(self, js, arg=None, timeout=30000, **k):
        end = time.time() + timeout / 1000.0
        while time.time() < end:
            if self.evaluate(js, arg): return True
            time.sleep(0.05)
        raise TimeoutError("wait_for_function timed out: " + js[:80])
    def title(self): return self.d.title
    @property
    def url(self): return self.d.current_url
    def inner_text(self, selector): return self.d.find_element("css selector", selector).text
    def click(self, selector, **k): self.d.find_element("css selector", selector).click()
    def on(self, event, cb):
        if event == "pageerror": self._err = lambda m: cb(Exception(m))
        elif event == "console":
            self._con = cb
            try: self._hook_console()
            except Exception: pass   # no page loaded yet: goto() hooks it
        elif event == "requestfailed":
            self._rf = cb
            try: self._hook_failed()
            except Exception: pass
        else: _no("page.on('%s') (only 'pageerror', 'console' and 'requestfailed')" % event)
    def close(self): pass


class _Context(_Strict):
    def __init__(self, d): self.d = d; self._page = None
    def route(self, pattern, handler, **k):
        if not getattr(sys.modules[__name__], "_warned_route", False):
            sys.modules[__name__]._warned_route = True
            print("pwfirefox: route() is accepted but blocks nothing; http(s) requests are NOT stopped in Firefox.", file=sys.stderr)
    def new_page(self):
        if self._page: _no("a second page in one context (one page at a time)")
        self._page = _Page(self.d); return self._page
    def close(self): pass


class _Browser(_Strict):
    def __init__(self, d): self.d = d
    @property
    def version(self): return self.d.capabilities.get("browserVersion", "")
    def new_context(self, viewport=None, **k):
        if k: _no("new_context(%s)" % ", ".join(sorted(k)))
        if viewport: self.d.set_window_size(viewport["width"], viewport["height"] + 120)
        return _Context(self.d)
    def new_page(self, **k): return self.new_context(**k).new_page()
    def close(self): self.d.quit()


class _Launcher(_Strict):
    def __init__(self, name): self.name = name
    def launch(self, headless=True, executable_path=None, args=None, **k):
        fx = (executable_path if self.name == "firefox" else None) or os.environ.get("FIREFOX_PATH") or shutil.which("firefox")   # chromium.launch(executable_path=chrome) is a path to Chrome: ignore it, start Firefox
        gd = os.environ.get("GECKODRIVER_PATH") or shutil.which("geckodriver")
        if not fx or not gd:
            raise SystemExit("pwfirefox needs Firefox and geckodriver: set FIREFOX_PATH and GECKODRIVER_PATH (see tools/firefox-stand-in/README.md)")
        o = Options(); o.binary_location = fx
        if headless: o.add_argument("-headless")
        d = webdriver.Firefox(options=o, service=Service(gd))
        print("pwfirefox: Firefox %s" % d.capabilities.get("browserVersion", "?"), file=sys.stderr)
        return _Browser(d)


class _Playwright:
    firefox = _Launcher("firefox")
    chromium = _Launcher("chromium")
    @property
    def webkit(self): _no("webkit")


TimeoutError = TimeoutError   # `from playwright.sync_api import TimeoutError` keeps working (a wait that ran out)


class sync_playwright:
    def __enter__(self): return _Playwright()
    def __exit__(self, *a): pass
