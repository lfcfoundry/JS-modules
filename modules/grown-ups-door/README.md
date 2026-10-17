# grown-ups-door

**Version 1.0.0 · API 1**

**Tested in:** Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time, in a real browser (`tests/pieces-browser.js`, 2026-10-17; WebKitGTK through WebDriver, page at least 447 px wide). Not run: GNOME Web (Epiphany) 46.5, a phone.

A short task that a young child will not finish, placed in front of the buttons and links a grown-up should press (start over, save and load, links to other sites). Press and hold a round button for 3 seconds, then drag the item into the target (or tap the item, then the target; the keyboard works too). Once passed, the guarded controls stay open for 2 minutes. 15 KB (5.2 KB gzipped), no dependencies, adds its own small stylesheet. Cut from Apple Press, with the apple art made replaceable.

**It is a speed bump, not security.** A determined older child, or anyone who can read the page, can get past it. It helps stop accidental and curious taps from a small child; it is not a legal age check and does not by itself make a game meet any store's rules for children's apps.

**Test it:** `node tests/pieces-browser.js` (hold, early lift, sliding off, drag, tap then tap, keyboard only, Escape and focus, links, touch, and the open time running out; Firefox 158 and ungoogled Chromium 155). **Try it:** `demo.html`.

## Use
```js
var door = GrownUpsDoor.attach({
  guard: "#reset, #saveBtn, .more-games a",     // a selector (or a function(el) that says yes or no): clicks on these ask for the task first
  texts: { itemName: "Apple", targetName: "Basket", drag: "Drag the apple into the basket. Or tap the apple, then tap the basket." },
  itemHtml: "<svg>...</svg>", targetHtml: "<svg>...</svg>"      // your own art (default: a plain red fruit and a basket)
});
door.isOpen();   // true while a pass is still good
door.lock();     // forget the pass now
door.destroy();  // remove the door and its listeners
```
- **How it guards:** one click listener on the page, in the capture phase. A click on a guarded control shows the door instead and stops the click; when the task is passed the original button is clicked for you. A guarded **link** is not followed (a pop-up opened later by a script can be blocked by the browser): the door shows an "Open ..." link after the task, and the grown-up taps that.
- **The task:** hold 3 seconds (letting go early, sliding more than 24 pixels off the button, a cancelled touch, or hiding the page starts the hold over); then drag the item to the target (the target is 10 pixels more forgiving than it looks), or tap the item and then the target. Space or Enter holds, and Space, Enter or a tap picks and drops, so a keyboard or switch user can finish it. Escape, "Not now" or a tap outside closes it and gives the focus back to the control that was pressed; Tab stays inside the door.
- **Options:** `holdMs` (3000), `openMs` (120000: how long a pass stays good), `texts` (every sentence; `title`, `hold`, `drag`, `notNow`, `itemName`, `targetName`, `opened`, and the functions `whyButton(name)`, `whyLink(name)`, `openLink(name)`), `nameOf(el)` (what the door calls the control; default its `data-door-name`, text or aria-label), `skip` (a boolean or function that turns the door off, for automated tests), `onOpen(pending)`, `onPass(pending)`, `root` (where to put the door).
- **Methods:** `isOpen()`, `isShown()`, `ask(control)` (show it from your own code; returns false when it is already open, so go ahead), `lock()`, `close()`, `destroy()`.
- **Looks:** the box takes `--gud-bg`, `--gud-text` and `--gud-accent` from your page's CSS, follows the dark color scheme and the focus ring is visible. The stylesheet is added once, with class names starting `gud`.

## Why
A children's game has buttons that can erase progress or leave the game for the web. A child will press anything that glows. A task that needs a 3-second hold and a drag is something most adults finish at once and most small children do not, with no reading and no math. Apple's page on the Kids category lists parental gates among its requirements, describing them as "adult-level tasks that must be completed in order to continue", with purchases and links out of the app as the examples; the page shows a plain task, a math task and a question task as gate styles. This module is the plain-task kind, and your game still has to meet whatever rules apply to where you publish it.

## Limits
- Not security and not a legal compliance product (see above). Nothing is stored: the pass lives only in the page's memory, so a reload locks it again.
- It can only guard what you point it at, and a keyboard shortcut or script in your own code that does the same thing has to be sent through `ask()` too.
- The hold uses pointer events and `requestAnimationFrame`; a page that is frozen for seconds can make the hold complete late. Hiding the page starts the hold over.
- Assistive technology: the door is a labelled modal dialog and works from the keyboard; it has not been tried with a screen reader.
- Real phones were not available for this check. Touch was driven by the browsers' own test drivers in Chromium and Firefox, not a hand on a screen.

## Prior art
- Apple's Kids category page (above) names parental gates as a requirement, with the example of tasks "an adult can do"; it leaves the design to you.
- I found no maintained standalone web library for this: an npm search for "parental gate" returned a React Native package at version 0.1.1 (2023) and unrelated results (one search, not exhaustive).
- The common alternatives are a math question or "type the word shown", which need reading. The hold-and-drag task needs neither.

## For AI agents
Attach it once, early, and guard only the controls that erase progress or leave the page. Say in the page that it is a speed bump. Do not use it to claim a game is "safe for kids" or compliant with a children's privacy law. Keep `skip` for automated tests and turn it off in the shipped page.
