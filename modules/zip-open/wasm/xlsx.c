/* xlsx.c: Excel sheet XML (bytes) to CSV (bytes) for zip-open, the usual shape only. Copyright (c) 2026 LFC Foundry. MIT License.
   Anything unusual returns -1 and the JavaScript reader does the sheet instead, so this only has to be right for what it accepts.
   Numbers that JavaScript would print differently (String(Number(v)) != v) and dates that are not whole days are left to JavaScript as "fixups". */
typedef unsigned char u8;
typedef unsigned int u32;

extern u8 __heap_base;
void *memset(void *d, int c, unsigned long n) __attribute__((optnone));
void *memcpy(void *d, const void *s, unsigned long n) __attribute__((optnone));
void *memset(void *d, int c, unsigned long n) { u8 *p = d; while (n--) *p++ = (u8)c; return d; }
void *memcpy(void *d, const void *s, unsigned long n) { u8 *p = d; const u8 *q = s; while (n--) *p++ = *q++; return d; }
u32 base(void) { return (u32)&__heap_base; }

static u32 nfix, fixcap, nrows; static u32 *fix;
u32 lines(void) { return nrows; }
u32 fixups(void) { return nfix; }

/* Shared strings table: per string, start and length in the sst bytes, and flags (1: has '&', 2: needs CSV quotes, 4: checked). */
static u32 *T; static u32 tn; static const u8 *S;

static int isWsCp(u32 c) { return c == 9 || c == 10 || c == 11 || c == 12 || c == 13 || c == 32 || c == 0xa0 || c == 0x1680 || (c >= 0x2000 && c <= 0x200a) || c == 0x2028 || c == 0x2029 || c == 0x202f || c == 0x205f || c == 0x3000 || c == 0xfeff; }
static u32 cpAt(const u8 *p, u32 n, u32 *len) {   /* decodes one UTF-8 code point; invalid -> 0xfffd (not whitespace either way) */
  u8 c = p[0];
  if (c < 0x80) { *len = 1; return c; }
  if (c >= 0xc2 && c < 0xe0 && n >= 2 && (p[1] & 0xc0) == 0x80) { *len = 2; return ((c & 31) << 6) | (p[1] & 63); }
  if (c >= 0xe0 && c < 0xf0 && n >= 3 && (p[1] & 0xc0) == 0x80 && (p[2] & 0xc0) == 0x80) { *len = 3; return ((c & 15) << 12) | ((p[1] & 63) << 6) | (p[2] & 63); }
  *len = 1; return 0xfffd;
}
static u32 lastCp(const u8 *p, u32 n) { u32 k = n, l; if (!n) return 0; while (k > 0 && n - k < 4) { k--; if ((p[k] & 0xc0) != 0x80) break; } return cpAt(p + k, n - k, &l); }

/* Entity at p (p[0] == '&'): writes the decoded UTF-8 into d (up to 4 bytes), returns bytes used in p (0: not an entity, copy '&' as is). */
static u32 entity(const u8 *p, u32 n, u8 *d, u32 *dl) {
  u32 i, cp = 0, nd = 0, hex = 0;
  #define LC(x) ((x) | 32)
  if (n >= 4 && LC(p[1]) == 'l' && LC(p[2]) == 't' && p[3] == ';') { d[0] = '<'; *dl = 1; return 4; }
  if (n >= 4 && LC(p[1]) == 'g' && LC(p[2]) == 't' && p[3] == ';') { d[0] = '>'; *dl = 1; return 4; }
  if (n >= 5 && LC(p[1]) == 'a' && LC(p[2]) == 'm' && LC(p[3]) == 'p' && p[4] == ';') { d[0] = '&'; *dl = 1; return 5; }
  if (n >= 6 && LC(p[1]) == 'q' && LC(p[2]) == 'u' && LC(p[3]) == 'o' && LC(p[4]) == 't' && p[5] == ';') { d[0] = '"'; *dl = 1; return 6; }
  if (n >= 6 && LC(p[1]) == 'a' && LC(p[2]) == 'p' && LC(p[3]) == 'o' && LC(p[4]) == 's' && p[5] == ';') { d[0] = '\''; *dl = 1; return 6; }
  if (n < 4 || p[1] != '#') return 0;
  i = 2;
  if (LC(p[2]) == 'x') { hex = 1; i = 3; }
  for (; i < n && nd < (hex ? 6u : 7u); i++, nd++) {
    u8 c = p[i];
    if (c >= '0' && c <= '9') cp = cp * (hex ? 16 : 10) + (c - '0');
    else if (hex && LC(c) >= 'a' && LC(c) <= 'f') cp = cp * 16 + (LC(c) - 'a' + 10);
    else break;
  }
  if (!nd || i >= n || p[i] != ';') return 0;
  if (!(cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff))) cp = 0xfffd;
  if (cp < 0x80) { d[0] = (u8)cp; *dl = 1; }
  else if (cp < 0x800) { d[0] = 0xc0 | (cp >> 6); d[1] = 0x80 | (cp & 63); *dl = 2; }
  else if (cp < 0x10000) { d[0] = 0xe0 | (cp >> 12); d[1] = 0x80 | ((cp >> 6) & 63); d[2] = 0x80 | (cp & 63); *dl = 3; }
  else { d[0] = 0xf0 | (cp >> 18); d[1] = 0x80 | ((cp >> 12) & 63); d[2] = 0x80 | ((cp >> 6) & 63); d[3] = 0x80 | (cp & 63); *dl = 4; }
  return i + 1;
}

/* Writes text p[0..n) as one CSV field into o (decoding entities when amp), quoting when needed. Returns the new end, or 0 when out of room. */
static u8 *field(u8 *o, u8 *oe, const u8 *p, u32 n, int amp) {
  u8 *st = o, tmp[4]; u32 i, k, dl, q = 0;
  if ((u32)(oe - o) < n + 2) return 0;
  /* decode first into o, then decide on quotes */
  for (i = 0; i < n; ) {
    if (amp && p[i] == '&' && (k = entity(p + i, n - i, tmp, &dl))) { if ((u32)(oe - o) < dl + 2) return 0; for (u32 j = 0; j < dl; j++) *o++ = tmp[j]; i += k; }
    else { if (o >= oe - 2) return 0; *o++ = p[i++]; }
  }
  n = (u32)(o - st);
  for (i = 0; i < n; i++) { u8 c = st[i]; if (c == '"' || c == ',' || c == '\n' || c == '\r') { q = 1; break; } }
  if (!q && n) { u32 l; if (isWsCp(cpAt(st, n, &l)) || isWsCp(lastCp(st, n))) q = 1; }
  if (!q) return o;
  /* quote: count quotes, shift right */
  u32 extra = 2; for (i = 0; i < n; i++) if (st[i] == '"') extra++;
  if ((u32)(oe - o) < extra) return 0;
  u8 *w = st + n + extra - 1; *w-- = '"';
  for (i = n; i-- > 0; ) { *w-- = st[i]; if (st[i] == '"') *w-- = '"'; }
  *w = '"';
  return st + n + extra;
}

/* <si><t>text</t></si> list -> T. Returns the count, or -1 for any other shape. */
int sst(const u8 *x, u32 n, u32 *tab, u32 cap) {
  u32 pos = 0, k = 0, cnt = 0; T = tab; S = x;
  while (pos + 3 <= n && !(x[pos] == '<' && x[pos + 1] == 's' && x[pos + 2] == 'i')) { if (x[pos] == '<' && x[pos + 1] == '!') return -1; pos++; }
  if (pos + 3 > n) return -1;
  for (;;) {
    while (pos < n && x[pos] != '<') pos++;
    if (pos >= n) return -1;
    if (n - pos >= 7 && x[pos+1]=='s' && x[pos+2]=='i' && x[pos+3]=='>' && x[pos+4]=='<' && x[pos+5]=='t' && x[pos+6]=='>') pos += 7;
    else if (n - pos >= 28 && x[pos+1]=='s' && x[pos+2]=='i' && x[pos+3]=='>' && x[pos+4]=='<' && x[pos+5]=='t' && x[pos+6]==' ') {
      const char *m = "xml:space=\"preserve\">"; for (k = 0; k < 21; k++) if (x[pos + 7 + k] != (u8)m[k]) return -1; pos += 28;
    }
    else if (n - pos >= 6 && x[pos+1]=='/' && x[pos+2]=='s' && x[pos+3]=='s' && x[pos+4]=='t' && x[pos+5]=='>') {
      for (k = pos; k + 2 < n; k++) if (x[k] == '<' && x[k+1] == 's' && x[k+2] == 'i') return -1;
      tn = cnt; return (int)cnt;
    }
    else return -1;
    u32 st = pos, amp = 0;
    while (pos < n && x[pos] != '<') { if (x[pos] == '&') amp = 1; pos++; }
    if (n - pos < 9 || x[pos+1]!='/' || x[pos+2]!='t' || x[pos+3]!='>' || x[pos+4]!='<' || x[pos+5]!='/' || x[pos+6]!='s' || x[pos+7]!='i' || x[pos+8]!='>') return -1;
    if (cnt >= cap || cnt >= 5000000) return -1;
    tab[cnt * 2] = st; tab[cnt * 2 + 1] = (pos - st) | (amp ? 0x80000000u : 0); cnt++;
    pos += 9;
  }
}

void nosst(void) { tn = 0; }

/* Strict UTF-8 check (what TextDecoder('utf-8', { fatal: true }) accepts). 1 = valid. */
int utf8ok(const u8 *p, u32 n) {
  u32 i = 0;
  while (i < n) {
    if (i + 8 <= n && !((*(const unsigned long long *)(p + i)) & 0x8080808080808080ULL)) { i += 8; continue; }
    u8 c = p[i];
    if (c < 0x80) { i++; continue; }
    if (c >= 0xc2 && c <= 0xdf) { if (i + 1 >= n || (p[i+1] & 0xc0) != 0x80) return 0; i += 2; continue; }
    if (c >= 0xe0 && c <= 0xef) {
      if (i + 2 >= n || (p[i+1] & 0xc0) != 0x80 || (p[i+2] & 0xc0) != 0x80) return 0;
      if (c == 0xe0 && p[i+1] < 0xa0) return 0; if (c == 0xed && p[i+1] > 0x9f) return 0; i += 3; continue;
    }
    if (c >= 0xf0 && c <= 0xf4) {
      if (i + 3 >= n || (p[i+1] & 0xc0) != 0x80 || (p[i+2] & 0xc0) != 0x80 || (p[i+3] & 0xc0) != 0x80) return 0;
      if (c == 0xf0 && p[i+1] < 0x90) return 0; if (c == 0xf4 && p[i+1] > 0x8f) return 0; i += 4; continue;
    }
    return 0;
  }
  return 1;
}

static int startsWith(const u8 *x, u32 n, u32 p, const char *s) { for (u32 i = 0; s[i]; i++) if (p + i >= n || x[p + i] != (u8)s[i]) return 0; return 1; }
static int findFrom(const u8 *x, u32 n, u32 p, const char *s) { for (; p < n; p++) if (x[p] == (u8)s[0] && startsWith(x, n, p, s)) return (int)p; return -1; }

/* Canonical number text: what String(Number(v)) gives back unchanged. */
static int canonical(const u8 *v, u32 n) {
  u32 i = 0, sig = 0, ip = 0, lz = 0, started = 0;
  if (!n) return 0;
  if (v[0] == '-') { i = 1; if (n == 1) return 0; }
  if (v[i] == '0') { i++; if (i < n && v[i] >= '0' && v[i] <= '9') return 0; ip = 1; }
  else { for (; i < n && v[i] >= '0' && v[i] <= '9'; i++) { ip++; sig++; } if (!ip) return 0; started = 1; }
  if (ip > 21) return 0;
  if (i < n) {
    if (v[i] != '.' || i + 1 >= n || v[n - 1] == '0') return 0;
    for (i++; i < n; i++) { if (v[i] < '0' || v[i] > '9') return 0; if (!started) { if (v[i] == '0') lz++; else { started = 1; sig++; } } else sig++; }
    if (v[0 + (v[0] == '-')] == '0' && lz > 5) return 0;
  } else if (v[0] == '-' && n == 2 && v[1] == '0') return 0;
  return sig <= 15;
}

/* Sheet bytes -> CSV bytes. xf: one byte per style number, 1 = a date style. Returns the CSV length, -1 = use JavaScript, -2 = out of room. */
int sheet(const u8 *x, u32 n, const u8 *xf, u32 xn, u32 d1904, u8 *out, u32 cap, u32 *fx, u32 fcap, u32 maxRows) {
  int sd = findFrom(x, n, 0, "<sheetData"), r0 = findFrom(x, n, 0, "<row"), c0 = findFrom(x, n, 0, "<c ");
  u32 pos, lt, gt, k, q, rows = 0; u8 *o = out, *oe = out + cap, *lineStart = 0, *rowStart = 0; int lastCol = -1, lastW = -1, inRow = 0, rowHas = 0;
  fix = fx; fixcap = fcap; nfix = 0;
  if (sd < 0 || r0 < sd || c0 < sd) return -1;   /* like the JavaScript reader: no <row or no <c at all, or one before <sheetData: general reader */
  for (pos = (u32)sd; pos < n && x[pos] != '>'; pos++) ;
  if (pos >= n || x[pos - 1] == '/') return -1;
  pos++;
  #define FLUSH() do { if (inRow) { if (!rowHas) o = rowStart; else { rows++; if (rows >= maxRows) return -1; } } inRow = 0; } while (0)
  #define BEGINROW() do { rowStart = o; if (rows) { if (o >= oe) return -2; *o++ = '\n'; } lineStart = o; inRow = 1; rowHas = 0; lastCol = -1; lastW = -1; } while (0)
  for (;;) {
    while (pos < n && x[pos] != '<') pos++;
    if (pos >= n) return -1;
    lt = pos;
    u8 ch = lt + 1 < n ? x[lt + 1] : 0;
    if (ch == 'r' && startsWith(x, n, lt + 1, "row") && lt + 4 < n && (x[lt + 4] == ' ' || x[lt + 4] == '>' || x[lt + 4] == '/')) {
      for (gt = lt + 4, q = 0; gt < n && x[gt] != '>'; gt++) { if (x[gt] == '"') q++; else if (x[gt] == '\'' || x[gt] == '<') return -1; }
      if (gt >= n || (q & 1)) return -1;
      FLUSH(); BEGINROW();
      if (x[gt - 1] == '/') FLUSH();
      pos = gt + 1;
    } else if (ch == 'c' && lt + 2 < n && x[lt + 2] == ' ') {
      int ci = -1, dupR = 0, self = 0; u8 ty = 'n'; u32 tlen = 1, xfv = 0, hasT = 0, hasS = 0;
      k = lt + 3;
      for (;;) {
        while (k < n && x[k] == ' ') k++;
        if (k >= n) return -1;
        if (x[k] == '>') { gt = k; break; }
        if (x[k] == '/') { if (k + 1 >= n || x[k + 1] != '>') return -1; self = 1; gt = k + 1; break; }
        q = k; while (k < n && ((x[k] >= 'a' && x[k] <= 'z') || (x[k] >= 'A' && x[k] <= 'Z'))) k++;
        if (k == q || k + 1 >= n || x[k] != '=' || x[k + 1] != '"') return -1;
        u32 vs = k + 2, ve = vs; while (ve < n && x[ve] != '"') { if (x[ve] == '&' || x[ve] == '<' || x[ve] == '>') return -1; ve++; }
        if (ve >= n) return -1;
        if (k - q == 1 && x[q] == 'r') {
          if (dupR) return -1; dupR = 1;
          u32 nn = 0, j = 0; for (; j < 3 && vs + j < ve; j++) { u8 c = x[vs + j]; if (c >= 'a' && c <= 'z') c -= 32; if (c < 'A' || c > 'Z') break; nn = nn * 26 + c - 64; }
          ci = j == 0 ? -1 : (int)nn - 1;
        } else if (k - q == 1 && x[q] == 't') {
          if (hasT) return -1; hasT = 1; tlen = ve - vs; ty = tlen ? x[vs] : 'n'; if (tlen == 0) { ty = 'n'; tlen = 1; }
          if (tlen != 1 && !(tlen == 3 && x[vs] == 's' && x[vs+1] == 't' && x[vs+2] == 'r')) return -1;   /* inlineStr and the rest: JavaScript */
          if (tlen == 3) ty = 'S';
        } else if (k - q == 1 && x[q] == 's') {
          if (hasS) return -1; hasS = 1; if (ve - vs > 9) return -1;
          for (u32 j = vs; j < ve; j++) { if (x[j] < '0' || x[j] > '9') return -1; xfv = xfv * 10 + (x[j] - '0'); }
        } else if (k - q == 5 && startsWith(x, n, q, "xmlns")) return -1;
        k = ve + 1;
        if (k < n && x[k] != ' ' && x[k] != '>' && x[k] != '/') return -1;
      }
      if (!inRow) return -1;
      if (ci < 0) ci = lastCol + 1;
      pos = gt + 1;
      int skip = ci >= 16384;
      if (!skip) lastCol = ci;
      if (self) continue;
      if (pos + 1 < n && x[pos] == '<' && x[pos + 1] == 'f' && pos + 2 < n && (x[pos + 2] == '>' || x[pos + 2] == ' ' || x[pos + 2] == '/')) {
        for (gt = pos + 2, q = 0; gt < n && x[gt] != '>'; gt++) { if (x[gt] == '"') q++; else if (x[gt] == '\'' || x[gt] == '<') return -1; }
        if (gt >= n || (q & 1)) return -1;
        if (x[gt - 1] == '/') pos = gt + 1;
        else { int e = findFrom(x, n, gt + 1, "</f>"); if (e < 0) return -1; for (k = gt + 1; k < (u32)e; k++) if (x[k] == '<') return -1; pos = (u32)e + 4; }
      }
      u32 vs = pos, vl = 0, amp = 0;
      if (startsWith(x, n, pos, "<v>")) {
        vs = pos + 3; k = vs; while (k < n && x[k] != '<') { if (x[k] == '&') amp = 1; k++; }
        if (k + 3 >= n || x[k + 1] != '/' || x[k + 2] != 'v' || x[k + 3] != '>') return -1;
        vl = k - vs; pos = k + 4;
      }
      if (!startsWith(x, n, pos, "</c>")) return -1;
      pos += 4;
      if (skip) continue;
      /* the cell's value */
      const u8 *v = x + vs; u8 *at;
      if (ty == 's') {
        u32 ix = 0; if (amp) return -1;
        for (k = 0; k < vl; k++) { if (v[k] < '0' || v[k] > '9' || k > 8) return -1; ix = ix * 10 + (v[k] - '0'); }
        if (ix >= tn) continue;                                   /* sst[ix] undefined -> '' -> not stored */
        u32 len = T[ix * 2 + 1] & 0x7fffffff; if (!len) continue;
        if (ci <= lastW) return -1;
        at = o + (lastW < 0 ? ci : ci - lastW); if (at >= oe) return -2; while (o < at) *o++ = ',';
        o = field(o, oe, S + T[ix * 2], len, T[ix * 2 + 1] >> 31); if (!o) return -2;
      } else if (ty == 'b') {
        if (ci <= lastW) return -1;
        at = o + (lastW < 0 ? ci : ci - lastW); if (at + 5 >= oe) return -2; while (o < at) *o++ = ',';
        if (vl == 1 && v[0] == '1') { *o++='T'; *o++='R'; *o++='U'; *o++='E'; } else { *o++='F'; *o++='A'; *o++='L'; *o++='S'; *o++='E'; }
      } else if (ty == 'n') {
        if (!vl) continue;
        if (amp) return -1;
        if (ci <= lastW) return -1;
        at = o + (lastW < 0 ? ci : ci - lastW); if (at + 10 >= oe) return -2; while (o < at) *o++ = ',';
        int isDate = xfv < xn && xf[xfv];
        int plain = vl <= 7; for (k = 0; k < vl && plain; k++) if (v[k] < '0' || v[k] > '9') plain = 0;
        if (plain && vl > 1 && v[0] == '0') plain = 0;
        if (isDate && plain) {
          int s = 0; for (k = 0; k < vl; k++) s = s * 10 + (v[k] - '0');
          if (s > 2958465) goto fixit;
          int z = s - (d1904 ? 24107 : 25569) + 719468, era = (z >= 0 ? z : z - 146096) / 146097, doe = z - era * 146097;
          int yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365, doy = doe - (365 * yoe + yoe / 4 - yoe / 100), mp = (5 * doy + 2) / 153;
          int dd = doy - (153 * mp + 2) / 5 + 1, mm = mp < 10 ? mp + 3 : mp - 9, yy = yoe + era * 400 + (mm <= 2 ? 1 : 0);
          if (yy > 9999 || yy < 1000) goto fixit;
          *o++ = '0' + yy / 1000; *o++ = '0' + yy / 100 % 10; *o++ = '0' + yy / 10 % 10; *o++ = '0' + yy % 10; *o++ = '-';
          *o++ = '0' + mm / 10; *o++ = '0' + mm % 10; *o++ = '-'; *o++ = '0' + dd / 10; *o++ = '0' + dd % 10;
        } else if (!isDate && canonical(v, vl)) {
          if ((u32)(oe - o) < vl) return -2; for (k = 0; k < vl; k++) *o++ = v[k];
        } else {
          fixit:
          if (nfix >= fixcap) return -3;
          fix[nfix * 4] = (u32)(o - out); fix[nfix * 4 + 1] = vs; fix[nfix * 4 + 2] = vl; fix[nfix * 4 + 3] = isDate; nfix++;
        }
      } else {   /* str, e and other one-letter types: the text itself */
        if (!vl) continue;
        if (ci <= lastW) return -1;
        at = o + (lastW < 0 ? ci : ci - lastW); if (at >= oe) return -2; while (o < at) *o++ = ',';
        o = field(o, oe, v, vl, amp); if (!o) return -2;
      }
      lastW = ci; rowHas = 1;
    } else if (ch == '/') {
      if (startsWith(x, n, lt, "</row>")) { FLUSH(); pos = lt + 6; }
      else if (startsWith(x, n, lt, "</sheetData>")) {
        if (findFrom(x, n, lt, "<row") >= 0 || findFrom(x, n, lt, "<c ") >= 0) return -1;
        FLUSH(); nrows = rows; return (int)(o - out);
      } else return -1;
    } else return -1;
  }
}
