# netflow-plot developer changelog

## 2.14.9 · API 2 · 2026-11-07

### Quick
line names wrap; thin dot plots stay readable

### Details
Line-end names longer than 16 letters wrap at a space onto a second line (each name keeps its own 14 px rows), when all names still fit; otherwise they are cut as before. In a dot plot whose rows are thinner than 13 px, every k-th name is written, dots shrink to fit their row, and the number axis writes every 2nd (3rd, ...) number when two would touch. Charts with roomy rows and short names draw the same as before.

### Deep
Requested by the owner (visuals review of 2.14.5).

## 2.14.8 · API 2 · 2026-11-07

### Quick
When lines end at different places, their names used to start at each line's own end and could sit on a line that runs on (birdstrikes C 0 on the yellow line); now all names start in one column after the last line end.

### Details
tags x = max tag x before spacing. 1 new check (427).

### Deep
Lead from the 2.14.1 review sheet.

## 2.14.7 · API 2 · 2026-11-07

### Quick
A dot plot with one dot per name sorts biggest first by the drawn value (an average sorts by the average), writes each value beside its dot one decimal finer than the scale, drops gridlines and the number axis in the clean look, and names the values at the top with a note when the scale does not start at zero. clean:false keeps the old axis.

### Details
CH.dotplot: sort xc.list by cell value when no color and no sort; dv = clean && !ck && step >= 11; val axis ends 44 px early for the values; vt from step decimals + 1; header 'Average lat, scale starts at 47.658'. 1 new check (426).

### Deep
Follow-up to 2.14.4 dots.

## 2.14.6 · API 2 · 2026-11-07

### Quick
Collision-safe keys for (x, color) cells; same pictures.

### Details
Cells of grouped charts (bars, dot plots, heatmaps, donuts, mosaics, slopes) were keyed by x + NUL + color, so a name holding NUL could merge two cells. Keys now put the first name's length in front, which no two pairs can share. Rows are grouped in two maps (x, then color) and the key is made once a cell, so make() is no slower (Node 22, 50,000-row grouped bar: 11.1-19.3 ms to 9.8-11.3 ms). 1,203 charts on the vega-datasets tables draw the same SVG bytes. Two tests ported from an earlier repair branch (2026.11.01): NUL inside names keeps 1 and 10 apart; the donut cap keeps every value with one folded Other (the current choice, kept).

### Deep
Requested by the owner (review card: port the ideas, close the old branches).

## 2.14.5 · API 2 · 2026-11-07

### Quick
Big line charts build faster; nothing looks different.

### Details
series() made two small lists for every x of every line, so 20,000 rows made 40,000 lists to collect. Each x now keeps its first value and row as plain numbers, and a list is made only when a second row lands on the same x; the rows are kept only for charts small enough to get dots. Same SVG on 84,000 random line and area charts (sum, mean, median, count, min, max, with repeats, blanks and -0) and on every test chart. make() on a 20,000-row line, repeated: Chromium 11.4 to 8.2 ms, Firefox 11.0 to 8.7 ms, WebKitGTK 10.5 to 9.2 ms; whole first page draw Chromium 66.8 to 47.1 ms, Firefox and WebKitGTK about even (0.89 to 1.01).

### Deep
speed only

## 2.14.4 · API 2 · 2026-11-07

### Quick
auto() turns a bar chart of averages into a dot plot when the averages are within 3% of each other (19 bars of 47.7 became dots that show the differences); number ticks closer than 1 apart get the decimals they need below 100 too (47.660, 47.662, not 47.7 six times); the dot plot axis uses the axis format.

### Details
guess(): bar with agg mean, no color, lo > 0 and hi - lo <= 0.03 hi -> dotplot + why; axisFor: decimals also when two ticks would print the same; CH.dotplot ticks use val.fmt. 2 new checks (425).

### Deep
udistrict.json drew 19 identical-looking bars.

## 2.14.3 · API 2 · 2026-11-07

### Quick
guess()/auto() size a treemap by a column named size/value/count/amount/total (or the first other number), never by the parent or id column; flare.json was sized by parent ids. The reason now says what sizes it.

### Details
treemap put: tn = nums minus par, id and G_ID names; tsz = first G_ADD or size-like name, else tn[0]; why gets ', sized by X'. 1 new check (423).

### Deep
flare.json tiles were sized by parent id numbers (query looked big, vis small).

## 2.14.2 · API 2 · 2026-11-07

### Quick
Number axes at 10,000 or more use one unit set by the biggest tick (5k ... 40k, 0.5B ... 3.0B), with the decimals the step needs; was 5,000 next to 10k and 500M next to 1B.

### Details
axisFor: tu from max(|lo|,|hi|) (1e9/1e6/1e3 at >= 1e4), ud = fewest decimals that keep every tick exact to step/1000, 0 written as 0.

### Deep
Lead from the test-set review.

## 2.14.1 · API 2 · 2026-11-07

### Quick
Line-end names are spaced 14 px (was 13, their boxes touched by half a pixel) and the lowest name and first value stay above the bottom edge (were 4 px below, touching the last year). A single line's low value beside its point stays above the bottom edge too (weather.csv's 0 sat on 2012).

### Details
tags spacing 13 -> 14; tags hi and starts hi2 F.B + 4 -> F.B - 1. Touching pairs on the 53-chart sheet: disasters 4 -> 0, unemployment 3 -> 0.

### Deep
Leads from the touching-label check (ovl).

## 2.14.0 · API 2 · 2026-11-07

### Quick
auto() picks horizontal bars when a third of the names are longer than 12 letters and they would not fit upright; sideways bars thin their numbers when two would touch.

### Details
auto: names <= 26, long*3 >= n and sum(min(14,len)*6.05+9) > (width-100)*1.6 -> horizontal; CH.bar horizontal value ticks: every hev-th label so neighbors keep 10 px. 2 new checks (421).

### Deep
burtin.json tilted and clipped 16 long bacteria names.

## 2.13.0 · API 2 · 2026-11-07

### Quick
Values on marks below 100,000 are written in full (10,048 not 10k); ticks closer than 1 apart at 100+ keep their decimals (la-riots longitude printed -118 four times); the key title goes through axisName.

### Details
fmtFor: kAt = Infinity when the biggest value < 1e5, commas for whole numbers >= 1e4; axisFor: ax.fmt with toFixed(ceil(-log10(step))) when step < 1 and |lo|,|hi| >= 100; F.legend title = axisName(title). 3 new checks (419).

### Deep
Leads from the 53-chart test-set review (2026.11.07).

## 2.12.2 · API 2 · 2026-11-07

### Quick
A number column named year (or yr) reads as years from 1000 to 2200: no thousands comma, whole-year ticks, no Year axis title. Other columns keep the 1800-2200 rule.

### Details
reader num() tags out.yearName for /year|^yr$/ columns; axisFor accepts lo >= 1000 and a span up to 1200 when tagged; line chart carries the tag onto allX. 2 new checks (416).

### Deep
Fixes the old open item: wheat.json years before 1800 printed as 1,600.

## 2.12.1 · API 2 · 2026-11-07

### Quick
takeaway() and title:'auto' write fraction values as percents and gaps in points, matching the chart (was 0.201 and '34% more than'); options as third argument honors percent:false.

### Details
takeaway wraps takeaway0 in a PCT scope from fractionCol on the takeaway spec; tLead and the line change use percentage points (tPts) when PCT. auto() and autoTitle pass their options. 6 new checks (414).

### Deep
Fixes the known 2.11.0 gap: the takeaway sentence printed 0.201 while the chart printed 20.1%.

## 2.12.0 · API 2 · 2026-11-07

### Quick
One color family everywhere; gray Others; up to 16 named lines; crowded sideways names thinned; swapped 50-name bars get top 10.

### Details
Owner card 'Mauve bars, one color everywhere' (12:26 PM ET 11.07): F.calm() no longer called for bar and box; navy (CALM[0]) kept for single-series bars with values below zero. Visuals check leads: Others bar F.gray with ink picked on the bar's own color; horizontal names at least 13 px apart (every k-th); our own x/y swap applies top 10 above 25 names; line-end names up to min(16, plot height / 14) lines; no start values when lines are not named; a real category named Other folds into the rest (no two series called Other). 11 of 61 vega-datasets auto charts change (color and the line names). SVG identical to Node in Firefox 158, Chromium 155 and WebKitGTK 2.52.6 for 6 cases in light and dark (12 of 12). 408 checks pass.

### Deep
Mauve bars everywhere, gray Others, named busy lines, thinned sideways names.

## 2.11.0 · API 2 · 2026-11-07

### Quick
Busy auto bar charts: top 10 plus Others; rates as percents. top: false and percent: false keep the old look.

### Details
New spec key top and drawing option percent. Auto: bar picks with more than 25 names and no negative values get top 10 and horizontal. Others is the sum, or the average for a measure whose name does not add up (G_ADD). Percents: bar, dotplot, line with all y in 0..1, at least half not whole, no color or stack, one row per x or mean/median, name not p-value, corr, coef, r2, index, score, lat, lon, x, y. Of 61 vega-datasets tables, 2 auto charts change (obesity, income). Same SVG in Firefox 158, Chromium 155 and WebKitGTK 2.52.6 as in Node (5 of 5). 406 checks pass. Look goes to the owner's picture card.

### Deep
Top 10 plus Others for busy auto bar charts, and percents for fractions. Look change, picture card.

## 2.10.1 · API 2 · 2026-11-07

### Quick
Bar and dot charts with x and y swapped draw correctly.

### Details
When type is bar or dotplot, y is not mostly numbers and x is (80% of filled values), x and y are swapped; bars also turn horizontal. Same SVG in Firefox 158, Chromium 155 and WebKitGTK 2.52.6 as in Node (5 of 5 cases). 403 checks pass.

### Deep
Swapped x and y on bar and dot charts used to draw a flat line with axes from -1 to 1. Now detected and fixed by swapping and laying bars sideways.

## 2.10.0 · API 2 · 2026-11-07

### Quick
Fixes from the visual review of the auto-chart sheet; picks and labels change look, no API change for calls that name a type

### Details
auto()/guess(): many-to-many flow tables (over 40 links, at least 30% of places both send and receive, counted on up to 5,000 rows spread over the table) pick type 'chord' (netflow-circular, 40 biggest links), Sankey next. type: 'chord' in toSvg. A scatter whose points nearly all sit in 1/150 of a column's range says so in why.
Lines: first values stay within 7 px of their line, ones that would touch are left out, later-starting lines get none; one precision per unit per chart. Axes: fewer, rounder number and date ticks when labels touch; month steps align (Jan, Apr, Jul, Oct) and the first month label keeps its year; no Date/Year axis name under a date or year axis; a first label at the corner starts at the axis. Key row keeps room for +N more.
Contact sheet of 53 public tables: touching label pairs 295 to 13 (Chromium text boxes). 402 checks (10 new; 9 fail on 2.9.0). 39 of 39 and 15 of 15 tables still right (flight tables relabeled to also accept chord).

### Deep
Requested by the owner via the visuals review (RESCORE-AUTO-CHART-SHEET-2026.11.07.md). The empty-looking health scatter came from the test loader splitting quoted CSV names on their commas; loader fixed, the squash rule added anyway. Tried: moving start labels apart (old way) overflowed with 11 lines; greedy keep within 7 px reads cleaner. Thinning every 2nd time tick dropped the January-with-year labels, so time ticks are rebuilt with fewer steps instead.

## 2.9.0 · API 2 · 2026-11-07

### Quick
Charts picked from the data with a plain reason, plus an opt-in takeaway sentence and screen-reader text

### Details
toSvg(rows) with no type, x or y picks the chart from the shape of the rows (Sankey, treemap, map-like scatter, line, scatter, bar, histogram, counts). auto(rows, options) returns { svg, type, spec, why, others, takeaway, alt }; others gives up to three more picks for a one-click change. guess(rows) gives the pick alone. On 54 real public tables (vega-datasets): 39 of 39 and 15 of 15 held out (the prototype: 20 of 39, 10 of 15). takeaway(rows, spec) returns one sentence worked out from the rows and an alt text; title: 'auto' draws it. Percents only on a fair base; ties, negatives, zeros and missing values handled. The same SVG in Node and all three browsers. A call with type, x or y draws as before.

### Deep
Requested by the owner (auto-chart and takeaway yeses, 2026.11.07).

## 2.8.0 · API 2 · 2026-11-05

### Quick
Owner's card "Tidy the column name" (2026.11.05 10:47 PM ET): an axis name taken from a column name is tidied (underscores, dashes and camelCase become spaces, first letter capital; words with capitals of their own such as GDP keep them),…

### Deep
Owner's card "Tidy the column name" (2026.11.05 10:47 PM ET): an axis name taken from a column name is tidied (underscores, dashes and camelCase become spaces, first letter capital; words with capitals of their own such as GDP keep them), and a one-letter name such as r or v is left out. Also opt-in Economist frame through netflow-scene 1.8.0 (frame: true or theme 'editorial').

## 2.7.0 · API 2 · 2026-11-05

### Quick
Clean look (default) now covers line charts per the owner's 11.01 rule (no gridlines, no numbered axis ticks, values on the marks): the y number axis, horizontal and vertical gridlines are gone; each line's first value is written left of i…

### Deep
Clean look (default) now covers line charts per the owner's 11.01 rule (no gridlines, no numbered axis ticks, values on the marks): the y number axis, horizontal and vertical gridlines are gone; each line's first value is written left of its start and its last value after its name at the right end; a single line also gets its high and low (beside the point when above or below would leave the plot). clean: false keeps the old axis.

## 2.6.0 · API 2 · 2026-11-05

### Quick
Economist checklist item 4a and the owner's no-dropped-labels rule (card 2026.11.05).

### Deep
Economist checklist item 4a and the owner's no-dropped-labels rule (card 2026.11.05). Clean look only (clean: false keeps the old look): line charts with a color column and up to 10 lines get bold names at the right end of each line, moved 13 px apart and inside the chart, in the line color mixed toward the text color until it reads at 4.5:1; room is kept on the right; more than 10 lines bring the key row back. Band axes that would drop every other name show all names on two staggered rows with a short tick; the axis name is left out when there is no room under them. Number axes over whole numbers 1800-2200 (span up to 300) print years without a thousands separator and only whole-year ticks (also in point tooltips). Sheet: js-modules-research/aesthetics-usability/economist-look-sheet-2026.11.05.html.

## 2.5.0 · API 2 · 2026-11-01

### Quick
toSvg(rows, o): chart words (type, x, y, color, size, agg, stack, horizontal, bins, smooth, index, cols, sort) and drawing words (theme, width, height, title, subtitle, source, highlight, clean) in one object; with no x/y the first text co…

### Deep
toSvg(rows, o): chart words (type, x, y, color, size, agg, stack, horizontal, bins, smooth, index, cols, sort) and drawing words (theme, width, height, title, subtitle, source, highlight, clean) in one object; with no x/y the first text column and first number column (rows plain or { attrs }); NetflowScene found automatically. One-call toSvg(data, options) (owner's 11:55 AM ET 11.01 name card; CONSISTENT-SYNTAX-PROPOSAL). Old forms keep working (told apart by shape). Checked in Chromium 155, Firefox 158, WebKitGTK 2.52.6 from page scripts: all six one-call pictures drawn. Requested by the owner.

## 2.4.0 · API 2 · 2026-11-01

### Quick
Clean look as the default (owner's card 1:06 PM ET 11.01, 'Make it the default').

### Deep
Clean look as the default (owner's card 1:06 PM ET 11.01, 'Make it the default'). Bar: every bar end gets its value (stack totals above, parts inside when the number fits, % for normalize, values at the right end for horizontal bars); the number axis, its gridlines and the bold axis name go, and the axis name sits small at the top left unless a value would touch it. Falls back to the number axis when any end value would not fit beside its bar. Box: median written over each box (or beside the median line, with the middle half's ends, when the gaps allow); one calm color for every box. Calm colors (bar and box only): #1f4e79, #4f8cc9, #9cc3e6, #2a8c82, #c99a2e, #b4533c, ... (dark set lighter). Labels: crowded two-word names go on two lines before any name tilts; end names never run past the number axis or the picture edge. New option clean: false for the old look. 80 of 440 sample pictures change (every bar and box picture); the other 360 (other chart types) are byte-identical. Overlapping text across 52 changed charts: none in Chromium 155 and WebKitGTK 2.52.6; Firefox 158 flags only the two lines of a wrapped name (line boxes, letters apart). Requested by the owner.

## 2.3.0 · API 2 · 2026-11-01

### Quick
Band-axis labels (bar, box, dotplot and the like) used to tilt whenever more than about half the axis room was in use (labels > maxN/2).

### Deep
Band-axis labels (bar, box, dotplot and the like) used to tilt whenever more than about half the axis room was in use (labels > maxN/2). They now tilt only when two shown labels would really touch, measured at about 6.05 px a character at 11 px with a 6 px gap. Of 440 sample pictures (11 types x 5 category sets x light/dark x widths 400, 640, 900, 1,400), 66 changed, all from tilted to flat; the other 374 are byte-identical. Measured gap between flat labels in the 33 changed light pictures: at least 11.8 px in Chromium 155 and Firefox 158, 11.2 px in WebKitGTK 2.52.6; none touch. Tilted labels also no longer run into the axis name. Requested by the owner.

## 2.2.0 · API 2 · 2026-11-01

### Quick
options.highlight: a value of the color column (or of x on bar charts with no color column).

### Deep
options.highlight: a value of the color column (or of x on bar charts with no color column). The other series share one gray (theme muted mixed 45% toward the background); the chosen series is moved last in the shape lists so it is drawn over them; a highlighted name past the color limit keeps its own place instead of joining Other. An unknown name changes nothing.

## 2.1.0 · API 2 · 2026-11-01

### Quick
make(rows, spec, o, NS) calls NS.addTitles(S, o) last when netflow-scene 1.4.0 is loaded.

### Deep
make(rows, spec, o, NS) calls NS.addTitles(S, o) last when netflow-scene 1.4.0 is loaded. Option words follow the shared list (type, theme, width, height, title, subtitle, source, highlight).

## 2.0.0 · API 2 · 2026-11-01

### Quick
pie type removed (owner's call); donut unchanged.

### Details
TYPES, NEEDS and the drawing code lose pie; pieCore renamed donutCore and only the donut calls it; donut SVG identical to 1.0.0 (counts, sums and means, both themes). Major version because a type an existing user might pass is gone; an unknown type draws bars, as before.

### Deep
netflow-plot 2.0.0: pie chart removed (owner's call); donut kept.

## 1.0.0 · API 1 · 2026-11-01
- **Quick:** first version, cut from Netflow Map's Charts tab (src/plot.js); 23 types, 328 checks.
- **Details:** global renamed NFMPlot to NetflowPlot; characters above U+007F written as escapes; number text no longer calls toLocaleString('en-US') per mark (about 25 microseconds a call in Chromium: a 2,000 dot scatter built in 52.7 ms, now 3.2 ms; same text on 600,025 values); a date text column reads each distinct date once; a plain number string skips the cleaning step; hexbin cells keyed by one number. Same scene, SVG and marks as the Netflow Map copy on 276 charts (23 types, 6 sizes, 2 themes). Race against Observable Plot, ECharts and Vega-Lite in the README.
