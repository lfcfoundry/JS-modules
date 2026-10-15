"""
marionette_lite: drive Firefox from Python with the standard library only (no selenium, no geckodriver, no pip installs).
Part of JS-modules, https://github.com/JNFoo/JS-modules
Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).

Firefox has a built-in remote-control server called Marionette (start it with --marionette). It speaks a tiny protocol over a
local TCP socket: messages are "<length>:<json>", commands are [0, id, "Name", {params}] and replies [1, id, error, result].
That is all this file implements, in about 60 lines, enough to open pages, run JavaScript, resize the window and take screenshots.

    from marionette_lite import Firefox
    fx = Firefox(binary='/path/to/firefox', width=500, height=900, dpr=1.0)   # headless by default
    fx.go('file:///tmp/game.html')
    print(fx.js('return [innerWidth, devicePixelRatio]'))
    fx.shot('/tmp/page.png')
    fx.close()

Notes
 - fx.js(code, args) runs the code as a function BODY, so use `return` to send a value back. It is synchronous; for long jobs start
   them with setTimeout inside the page and poll a window variable (see tools/fuzz-play/inpage.js).
 - A fresh profile is created each time (prefs below turn off first-run pages, updates and telemetry).
 - Extra prefs: Firefox(prefs={'privacy.resistFingerprinting': True}), handy for testing how your page behaves in strict privacy mode.
"""
import socket, json, subprocess, time, os, base64, shutil, tempfile


class Firefox:
    def __init__(self, binary='firefox', width=1280, height=800, dpr=1.0, dark=False, port=2828, profile=None,
                 prefs=None, headless=True, env=None):
        self.profile = profile or tempfile.mkdtemp(prefix='marionette-lite-')
        shutil.rmtree(self.profile, ignore_errors=True); os.makedirs(self.profile)
        p = {'marionette.port': port, 'layout.css.devPixelsPerPx': str(dpr), 'ui.systemUsesDarkTheme': 1 if dark else 0,
             'browser.shell.checkDefaultBrowser': False, 'datareporting.policy.dataSubmissionEnabled': False,
             'toolkit.telemetry.reportingpolicy.firstRun': False, 'app.update.enabled': False,
             'browser.startup.homepage_override.mstone': 'ignore', 'dom.max_script_run_time': 0}
        p.update(prefs or {})
        with open(os.path.join(self.profile, 'user.js'), 'w') as f:
            for k, v in p.items():
                f.write('user_pref(%s, %s);\n' % (json.dumps(k), json.dumps(v)))
        e = dict(os.environ, **(env or {}))
        if headless:
            e['MOZ_HEADLESS'] = '1'
        cmd = [binary, '--no-remote', '--marionette', '--profile', self.profile, '--width', str(width), '--height', str(height), 'about:blank']
        if headless:
            cmd.insert(1, '--headless')
        self.p = subprocess.Popen(cmd, env=e, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.id = 0
        self.buf = b''
        for _ in range(100):
            try:
                self.s = socket.create_connection(('127.0.0.1', port)); break
            except OSError:
                time.sleep(0.3)
        else:
            raise RuntimeError('Firefox did not open its Marionette port')
        self.s.settimeout(120)
        self._read()                                        # the server greets first
        self.cmd('WebDriver:NewSession', {'capabilities': {}})
        self.cmd('WebDriver:SetWindowRect', {'width': width, 'height': height})

    def _read(self):
        while b':' not in self.buf:
            self.buf += self.s.recv(65536)
        n, rest = self.buf.split(b':', 1)
        n = int(n)
        while len(rest) < n:
            rest += self.s.recv(1 << 20)
        self.buf = rest[n:]
        return json.loads(rest[:n])

    def cmd(self, name, params=None):
        self.id += 1
        m = json.dumps([0, self.id, name, params or {}]).encode()
        self.s.sendall(str(len(m)).encode() + b':' + m)
        while True:
            r = self._read()
            if isinstance(r, list) and r[0] == 1 and r[1] == self.id:
                if r[2]:
                    raise RuntimeError(r[2])
                return r[3]

    def go(self, url):
        self.cmd('WebDriver:Navigate', {'url': url})

    def js(self, code, args=None):
        return self.cmd('WebDriver:ExecuteScript', {'script': code, 'args': args or []}).get('value')

    def resize(self, w, h):
        self.cmd('WebDriver:SetWindowRect', {'width': w, 'height': h})

    def shot(self, path, full=False):
        r = self.cmd('WebDriver:TakeScreenshot', {'full': full, 'hash': False})
        with open(path, 'wb') as f:
            f.write(base64.b64decode(r['value']))

    def wait_js(self, expr, timeout=30, every=0.5):
        """Polls a JavaScript expression until it is truthy; returns its value or None on timeout."""
        t0 = time.time()
        while time.time() - t0 < timeout:
            v = self.js('return (' + expr + ')')
            if v:
                return v
            time.sleep(every)
        return None

    def close(self):
        try:
            self.cmd('Marionette:Quit')
        except Exception:
            pass
        try:
            self.p.kill()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()
