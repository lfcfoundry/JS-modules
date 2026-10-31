// Copyright (c) 2026 LFC Foundry. MIT License.
package main

// Nested block (kind n): a table of distinct row shapes ("skeletons"), a shape id per row, number and boolean columns found by path hash, and a pool of strings.

type col struct {
	v []float64
	i int
}

// scol: the strings of one string path (blocks with per-path strings, sp = 1)
type scol struct {
	v []string
	i int
}

// sharedTables: footer section 16 (files packed with share: true), the strings and row shapes that nested blocks with g = 1 point into.
type sharedTables struct {
	s []string
	k []string
}

func (f *File) sharedTables() *sharedTables {
	if f.shared != nil {
		return f.shared
	}
	b, ok := f.sec[16]
	if !ok {
		return nil
	}
	o, _ := jsonOf(b).(*Obj)
	if o == nil {
		fail("damaged file: shared tables")
	}
	t := &sharedTables{}
	for _, name := range []string{"s", "k"} {
		a, ok := field(o, name).([]any)
		if !ok {
			fail("damaged file: shared tables")
		}
		for _, x := range a {
			str, ok := x.(string)
			if !ok {
				fail("damaged file: shared tables")
			}
			if name == "s" {
				t.s = append(t.s, str)
			} else {
				t.k = append(t.k, str)
			}
		}
	}
	f.shared = t
	return t
}

type plan struct {
	t     byte // s n b z j a o, S J (string from the path's own list)
	c     *col
	sc    *scol
	kids  []*plan
	names []string
}

func readNested(b []byte, sh *sharedTables) []any {
	h, p := blockHeader(b)
	c := &cursor{d: b, p: p}
	cm := field(h, "cm").([]any)
	cmeta, _ := jsonOf(unzstdB(c.take(num(cm[1])))).([]any)
	pp := ints(field(h, "p"))
	dtext := unzstdB(c.take(pp[0]))
	for _, ch := range dtext {
		if ch > 127 {
			fail("dictionary text is not ASCII")
		}
	}
	D := splitNul(dtext)
	sd, _ := jsonOf(unzstdB(c.take(pp[1]))).(*Obj)
	sidx := ints(field(sd, "idx"))
	sstr, _ := field(sd, "str").([]any)
	for i, ix := range sidx {
		if ix < 0 || ix >= len(D) {
			fail("side list index out of range")
		}
		D[ix], _ = sstr[i].(string)
	}
	skel := splitNL(unzstdB(c.take(pp[2])))
	idsM := ints(field(h, "ids")) // kind, count, packed length
	ids := typed(unzstdB(c.take(idsM[2])), idsM[0], idsM[1])
	// g = 1: the block uses the file's shared tables; string codes are stored as they are (no first-appearance flags)
	g := false
	if gv, ok := h.Get("g"); ok {
		if x, ok := gv.(float64); ok && x == 1 {
			g = true
		}
	}
	var fa []int
	var flags []byte
	var rep, gcodes []float64
	// sp = 1: per-path strings; a table [hash, entries, cells] per string path, each path's dictionary entries in turn, its own flags (from a fresh byte) and repeats.
	// sp = 2 (with g = 1): a table [hash, cells] and the typed codes of the shared-table block, path after path. Either way the string cells of a row read from their path (spm).
	spv := 0
	if sv, ok := h.Get("sp"); ok {
		if x, ok := sv.(float64); ok && (x == 1 || x == 2) {
			spv = int(x)
		}
	}
	if (spv == 1 && g) || (spv == 2 && !g) {
		fail("bad string layout")
	}
	spm := spv != 0
	var stab []any
	var sfl []byte
	var srep []float64
	var sf []int
	var ptab []any
	readPaths := func() {
		sf = ints(field(h, "sf")) // tableRaw, tableLen, flagsRaw, flagsLen, repKind, repCount, repLen
		stab, _ = jsonOf(unzstdB(c.take(sf[1]))).([]any)
		sfl = unzstdB(c.take(sf[3]))
		if sf[4] < 0 || sf[4] > 2 {
			fail("bad repeat width")
		}
		srep = typed(unzstdB(c.take(sf[6])), sf[4], sf[5])
	}
	L, LK := 0, 0
	if g {
		if sh == nil {
			fail("shared tables missing")
		}
		L, LK = num(field(h, "count")), num(field(h, "kc"))
		if L > 0 && len(D) != L {
			fail("dictionary count")
		}
		if LK == 0 {
			skel = nil
		} else if len(skel) != LK {
			fail("shape count")
		}
		if spm {
			pt := ints(field(h, "pt")) // tableRaw, tableLen
			ptab, _ = jsonOf(unzstdB(c.take(pt[1]))).([]any)
		}
		cd := ints(field(h, "cd")) // kind, count, packed length
		if cd[0] < 0 || cd[0] > 2 {
			fail("bad string code width")
		}
		gcodes = typed(unzstdB(c.take(cd[2])), cd[0], cd[1])
	}
	if g {
	} else if spm {
		readPaths()
	} else {
		fa = ints(field(h, "fa")) // [_, flagsLen, repKind, repCount, repLen, total]
		flags = unzstdB(c.take(fa[1]))
		rep = typed(unzstdB(c.take(fa[4])), fa[2], fa[3])
	}
	cols := map[uint32][]float64{}
	for _, e := range cmeta {
		a := e.([]any)
		key := uint32(num(a[0]))
		if num(a[1]) == 7 {
			if len(a) < 5 {
				fail("decimal column without raw length")
			}
			raw := unzstdB(c.take(num(a[3])))
			if len(raw) != num(a[4]) {
				fail("decimal column length mismatch")
			}
			cols[key] = decimals(raw, num(a[2]))
		} else {
			cols[key] = typed(unzstdB(c.take(num(a[3]))), num(a[1]), num(a[2]))
		}
	}
	var strs []string
	if g {
		strs = make([]string, 0, len(gcodes))
		for _, x := range gcodes {
			code := int(x)
			if code < L {
				strs = append(strs, D[code])
			} else if code-L < len(sh.s) {
				strs = append(strs, sh.s[code-L])
			} else {
				fail("string code %d out of range", code)
			}
		}
	}
	spc := map[uint32]*scol{}
	if spm && g {
		at := 0
		for _, x := range ptab {
			a, ok := x.([]any)
			if !ok || len(a) < 2 {
				fail("string path table")
			}
			hf, ok1 := a[0].(float64)
			nf, ok2 := a[1].(float64)
			if !ok1 || !ok2 || hf < 0 || hf > 4294967295 || hf != float64(int64(hf)) || nf < 0 || nf != float64(int64(nf)) || at+int(nf) > len(strs) {
				fail("string path table")
			}
			if _, dup := spc[uint32(hf)]; dup {
				fail("string path table")
			}
			spc[uint32(hf)] = &scol{v: strs[at : at+int(nf)]}
			at += int(nf)
		}
		if at != len(strs) {
			fail("string path table")
		}
	}
	if spm && !g {
		count := num(field(h, "count"))
		if count > 0 && len(D) != count {
			fail("dictionary count")
		}
		ET, RT, FT := 0, 0, 0
		type pent struct {
			h    uint32
			e, n int
		}
		pl := make([]pent, 0, len(stab))
		for _, x := range stab {
			a, ok := x.([]any)
			if !ok || len(a) < 3 {
				fail("string path table")
			}
			var v [3]float64
			for j := 0; j < 3; j++ {
				f, ok := a[j].(float64)
				if !ok || f < 0 || f != float64(int64(f)) || f > 4294967295 {
					fail("string path table")
				}
				v[j] = f
			}
			e, n := int(v[1]), int(v[2])
			if e > n || (e == 0 && n != 0) {
				fail("string path table")
			}
			ET += e
			RT += n - e
			FT += (n + 7) >> 3
			pl = append(pl, pent{uint32(v[0]), e, n})
		}
		ES := D
		if ET != count || RT != len(srep) || RT != sf[5] || FT != len(sfl) || FT != sf[2] {
			fail("string path table")
		}
		base, ri, fo := 0, 0, 0
		for _, q := range pl {
			if _, dup := spc[q.h]; dup {
				fail("string path table")
			}
			out := make([]string, q.n)
			nx := 0
			for i := 0; i < q.n; i++ {
				if (sfl[fo+i>>3]>>(uint(i)&7))&1 == 1 {
					if nx >= q.e {
						fail("string flags")
					}
					out[i] = ES[base+nx]
					nx++
				} else {
					k := int(srep[ri])
					ri++
					if k >= q.e {
						fail("string code %d out of range", k)
					}
					out[i] = ES[base+k]
				}
			}
			if nx != q.e {
				fail("string flags")
			}
			spc[q.h] = &scol{v: out}
			base += q.e
			fo += (q.n + 7) >> 3
		}
	}
	getS := func(hh uint32) *scol {
		x, ok := spc[hh]
		if !ok {
			fail("string path table")
		}
		return x
	}
	next, ri := 0, 0
	for i := 0; !g && !spm && i < fa[5]; i++ {
		var code int
		if i>>3 < len(flags) && (flags[i>>3]>>(uint(i)&7))&1 == 1 {
			code = next
			next++
		} else {
			if ri >= len(rep) {
				fail("string code list cut off")
			}
			code = int(rep[ri])
			ri++
		}
		if code < 0 || code >= len(D) {
			fail("string code %d out of range", code)
		}
		strs = append(strs, D[code])
	}
	cur := map[uint32]*col{}
	getCol := func(hh uint32) *col {
		if x, ok := cur[hh]; ok {
			return x
		}
		x := &col{v: cols[hh]}
		cur[hh] = x
		return x
	}
	var desc func(s any, path string) *plan
	desc = func(s any, path string) *plan {
		switch x := s.(type) {
		case float64:
			switch int(x) {
			case 1:
				if spm {
					return &plan{t: 'S', sc: getS(fnv(path))}
				}
				return &plan{t: 's'}
			case 2:
				return &plan{t: 'n', c: getCol(fnv(path))}
			case 3:
				return &plan{t: 'b', c: getCol(fnv(path + "?"))}
			case 4:
				return &plan{t: 'z'}
			case 5:
				if spm {
					return &plan{t: 'J', sc: getS(fnv(path))}
				}
				return &plan{t: 'j'}
			}
			fail("bad shape code %v", x)
		case []any:
			pl := &plan{t: 'a'}
			for _, k := range x {
				pl.kids = append(pl.kids, desc(k, path+"[]"))
			}
			return pl
		case *Obj:
			pl := &plan{t: 'o', names: x.Keys}
			for i, k := range x.Keys {
				v := x.Vals[i]
				if f, ok := v.(float64); ok && f >= 1 && f <= 4 {
					switch int(f) {
					case 1:
						if spm {
							pl.kids = append(pl.kids, &plan{t: 'S', sc: getS(fnv(path + "." + k))})
						} else {
							pl.kids = append(pl.kids, &plan{t: 's'})
						}
					case 2:
						pl.kids = append(pl.kids, &plan{t: 'n', c: getCol(fnv(path + "." + k))})
					case 3:
						pl.kids = append(pl.kids, &plan{t: 'b', c: getCol(fnv(path + "." + k + "?"))})
					case 4:
						pl.kids = append(pl.kids, &plan{t: 'z'})
					}
				} else {
					pl.kids = append(pl.kids, desc(v, path+"."+k))
				}
			}
			return pl
		}
		fail("bad shape")
		return nil
	}
	ti := 0
	nextStr := func() string {
		if ti >= len(strs) {
			fail("string pool cut off")
		}
		s := strs[ti]
		ti++
		return s
	}
	nextNum := func(x *col) float64 {
		if x.i >= len(x.v) {
			fail("number column cut off")
		}
		v := x.v[x.i]
		x.i++
		return v
	}
	nextS := func(x *scol) string {
		if x.i >= len(x.v) {
			fail("string path cut off")
		}
		s := x.v[x.i]
		x.i++
		return s
	}
	var build func(d *plan) any
	build = func(d *plan) any {
		switch d.t {
		case 's':
			return nextStr()
		case 'n':
			return nextNum(d.c)
		case 'b':
			return nextNum(d.c) == 1
		case 'z':
			return nil
		case 'j':
			return jsonOf([]byte(nextStr()))
		case 'S':
			return nextS(d.sc)
		case 'J':
			return jsonOf([]byte(nextS(d.sc)))
		case 'a':
			out := make([]any, len(d.kids))
			for i, k := range d.kids {
				out[i] = build(k)
			}
			return out
		}
		o := &Obj{}
		for i, k := range d.kids {
			o.Set(d.names[i], build(k))
		}
		return o
	}
	plans := make([]*plan, len(skel))
	for i, s := range skel {
		plans[i] = desc(jsonOf([]byte(s)), "")
	}
	n := num(field(h, "n"))
	if n > len(ids) {
		fail("shape id list cut off")
	}
	rows := make([]any, 0, n)
	gplans := map[int]*plan{}
	for _, id := range ids[:n] {
		k := int(id)
		if g && k >= LK {
			if k-LK >= len(sh.k) {
				fail("shape id out of range")
			}
			pl, ok := gplans[k-LK]
			if !ok {
				pl = desc(jsonOf([]byte(sh.k[k-LK])), "")
				gplans[k-LK] = pl
			}
			rows = append(rows, build(pl))
			continue
		}
		if k >= len(plans) {
			fail("shape id out of range")
		}
		rows = append(rows, build(plans[k]))
	}
	for _, x := range spc {
		if x.i != len(x.v) {
			fail("string cells left over")
		}
	}
	return rows
}
