// Copyright (c) 2026 LFC Foundry. MIT License.
package main

import (
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
)

func unzstdB(b []byte) []byte { return unzstd(b) }

func splitNL(b []byte) []string { return strings.Split(string(b), "\n") }

// Flat block (kind f): one column per key; a presence bitmap per key (or, when "ord" is present, a key-order id per row) says which keys a row has.

func readFlat(b []byte) []any {
	h, p := blockHeader(b)
	c := &cursor{d: b, p: p}
	m := ints(field(h, "m"))
	meta, _ := jsonOf(unzstdB(c.take(m[1]))).(*Obj)
	n := num(field(h, "n"))
	keysA, _ := field(meta, "keys").([]any)
	keys := make([]string, len(keysA))
	for i, k := range keysA {
		keys[i], _ = k.(string)
	}
	K := len(keys)
	pl := unzstdB(c.take(ints(field(h, "pl"))[1]))
	var ordl [][]int
	var ordids []float64
	if ov, ok := meta.Get("ord"); ok {
		colTypes["ord"]++
		om := ints(ov)
		ol, _ := jsonOf(unzstdB(c.take(om[1]))).([]any)
		for _, l := range ol {
			ordl = append(ordl, ints(l))
		}
		ordids = typed(unzstdB(c.take(om[4])), om[2], n)
	}
	colsA, _ := field(meta, "cols").([]any)
	vals := make([][]any, len(colsA))
	for ci, cmv := range colsA {
		cm, _ := cmv.(*Obj)
		var fr [][]byte
		for _, fv := range field(cm, "f").([]any) {
			f := ints(fv) // raw length, stored length, zstd flag
			sb := c.take(f[1])
			if f[2] != 0 {
				fr = append(fr, unzstdB(sb))
			} else {
				fr = append(fr, sb)
			}
		}
		vals[ci] = decodeCol(cm, fr)
	}
	ptr := make([]int, K)
	out := make([]any, 0, n)
	take := func(kk int) any {
		if kk >= len(vals) || ptr[kk] >= len(vals[kk]) {
			fail("column %d cut off", kk)
		}
		v := vals[kk][ptr[kk]]
		ptr[kk]++
		return v
	}
	if ordl != nil {
		for i := 0; i < n; i++ {
			o := &Obj{}
			ol := int(ordids[i])
			if ol >= len(ordl) {
				fail("key-order id out of range")
			}
			for _, kk := range ordl[ol] {
				o.Set(keys[kk], take(kk))
			}
			out = append(out, o)
		}
		return out
	}
	pb := (n + 7) >> 3
	if len(pl) < K*pb {
		fail("presence bitmap cut off")
	}
	for i := 0; i < n; i++ {
		o := &Obj{}
		for j := 0; j < K; j++ {
			if (pl[j*pb+(i>>3)]>>(uint(i)&7))&1 == 1 {
				o.Set(keys[j], take(j))
			}
		}
		out = append(out, o)
	}
	for j := 0; j < K && j < len(vals); j++ {
		if ptr[j] != len(vals[j]) {
			fail("presence bits do not match the column")
		}
	}
	return out
}

// colTypes counts the column types seen, for `info`.
var colTypes = map[string]int{}

func pnum(o *Obj, k string) int { return num(field(o, k)) }

func decodeCol(c *Obj, fr [][]byte) []any {
	n := pnum(c, "n")
	t, _ := field(c, "t").(string)
	colTypes[t]++
	p, _ := field(c, "p").(*Obj)
	if p == nil {
		p = &Obj{}
	}
	pf := func(k string) float64 { // numeric parameter, 0 when absent
		v, _ := p.Get(k)
		f, _ := v.(float64)
		return f
	}
	pb := func(k string) bool { // truthy parameter
		v, _ := p.Get(k)
		switch x := v.(type) {
		case bool:
			return x
		case float64:
			return x != 0
		}
		return false
	}
	need := func(i int) []byte {
		if i >= len(fr) {
			fail("column frame missing")
		}
		return fr[i]
	}
	out := make([]any, 0, n)
	switch t {
	case "V":
		u := varints(need(0), n)
		scale := pf("scale")
		vals := make([]float64, n)
		if pb("mono") {
			var s int64
			for i := range u {
				s += int64(u[i])
				vals[i] = float64(s)
			}
			if s > 1<<53 {
				fail("number column out of range")
			}
		} else if pb("delta") {
			var s int64
			for i := range u {
				s += unzz(u[i])
				if s > 1<<53 || s < -(1<<53) {
					fail("number column out of range")
				}
				vals[i] = float64(s)
			}
		} else {
			for i := range u {
				vals[i] = float64(unzz(u[i]))
			}
		}
		for _, x := range vals {
			if scale != 1 {
				x /= scale
			}
			out = append(out, x)
		}
	case "B":
		u := bitunpack(need(0), n, int(pf("w")))
		mn, scale := pf("mn"), pf("scale")
		for _, x := range u {
			v := float64(x) + mn
			if scale != 1 {
				v /= scale
			}
			out = append(out, v)
		}
	case "F":
		for _, x := range typed(need(0), 6, n) {
			out = append(out, x)
		}
	case "T":
		for _, x := range bitunpack(need(0), n, 1) {
			out = append(out, x == 1)
		}
	case "H":
		bl := int(pf("L")) / 2
		r := need(0)
		if len(r) < n*bl {
			fail("hex column cut off")
		}
		for i := 0; i < n; i++ {
			out = append(out, hex.EncodeToString(r[i*bl:(i+1)*bl]))
		}
	case "U":
		r := need(0)
		if len(r) < n*16 {
			fail("uuid column cut off")
		}
		for i := 0; i < n; i++ {
			h := hex.EncodeToString(r[i*16 : (i+1)*16])
			out = append(out, h[:8]+"-"+h[8:12]+"-"+h[12:16]+"-"+h[16:20]+"-"+h[20:])
		}
	case "I":
		r := need(0)
		if len(r) < n*4 {
			fail("ipv4 column cut off")
		}
		for i := 0; i < n; i++ {
			out = append(out, fmt.Sprintf("%d.%d.%d.%d", r[4*i], r[4*i+1], r[4*i+2], r[4*i+3]))
		}
	case "s":
		if n > 0 {
			for _, s := range splitNul(need(0)) {
				out = append(out, s)
			}
		}
	case "A":
		lens := varints(need(0), n)
		m := int(pf("m"))
		vs := varints(need(1), m)
		asc := pb("asc")
		pos := 0
		for _, ln := range lens {
			var acc int64
			lst := make([]any, 0, ln)
			for k := uint64(0); k < ln; k++ {
				if pos >= len(vs) {
					fail("list column cut off")
				}
				d := vs[pos]
				pos++
				if asc {
					acc += int64(d)
				} else {
					acc += unzz(d)
				}
				lst = append(lst, float64(acc))
			}
			out = append(out, lst)
		}
	case "L":
		for _, s := range untemplate(n, fr) {
			out = append(out, s)
		}
	case "D":
		lab := splitNul(need(0))
		var cd []uint64
		if w := int(pf("w")); w != 0 {
			cd = bitunpack(need(1), n, w)
		} else if pb("wide") {
			for _, x := range typed(need(1), 1, n) {
				cd = append(cd, uint64(x))
			}
		} else {
			r := need(1)
			if len(r) < n {
				fail("dictionary codes cut off")
			}
			for _, x := range r[:n] {
				cd = append(cd, uint64(x))
			}
		}
		for _, x := range cd {
			if int(x) >= len(lab) {
				fail("dictionary code out of range")
			}
			out = append(out, lab[x])
		}
	default: // JSON text, one value per line
		if n > 0 {
			for _, s := range splitNL(need(0)) {
				out = append(out, jsonOf([]byte(s)))
			}
		}
	}
	if len(out) < n {
		fail("column %q has %d values, wanted %d", t, len(out), n)
	}
	return out
}

// untemplate rebuilds log-line strings from templates (text with \x01 where a slot goes), a template id per row, and pooled slot values.
func untemplate(n int, fr [][]byte) []string {
	if len(fr) < 5 {
		fail("template column frames missing")
	}
	var tl []string
	if n > 0 {
		tl = splitNul(fr[0])
	}
	parts := make([][]string, len(tl))
	for i, t := range tl {
		parts[i] = strings.Split(t, "\x01")
	}
	if len(fr[1]) < 2*n {
		fail("template ids cut off")
	}
	ids := make([]int, n)
	for i := range ids {
		ids[i] = int(fr[1][i]) | int(fr[1][n+i])<<8
		if ids[i] >= len(tl) {
			fail("template id out of range")
		}
	}
	nb, kinds := fr[3], fr[4]
	var tx []string
	if len(fr[2]) > 0 {
		tx = splitNul(fr[2])
	}
	cnt := make([]int, len(tl))
	first := make([]bool, len(tl))
	type slot struct{ t, k int }
	var order []slot
	for _, i := range ids {
		cnt[i]++
		if !first[i] {
			first[i] = true
			for k := 0; k < len(parts[i])-1; k++ {
				order = append(order, slot{i, k})
			}
		}
	}
	store := map[slot][]string{}
	np, tp := 0, 0
	for j, key := range order {
		c := cnt[key.t]
		if j >= len(kinds) {
			fail("template slot kinds cut off")
		}
		var vals []string
		if kinds[j] != 0 {
			var a int64
			for r := 0; r < c; r++ {
				if np >= len(nb) {
					fail("template numbers cut off")
				}
				var u, mul uint64 = 0, 1
				for {
					if np >= len(nb) {
						fail("template numbers cut off")
					}
					b := nb[np]
					np++
					u += uint64(b&127) * mul
					mul *= 128
					if b&128 == 0 {
						break
					}
				}
				a += unzz(u)
				vals = append(vals, strconv.FormatInt(a, 10))
			}
		} else {
			if tp >= len(tx) {
				fail("template text cut off")
			}
			vals = strings.Split(tx[tp], "\n")
			tp++
		}
		store[key] = vals
	}
	seen := make([]int, len(tl))
	out := make([]string, 0, n)
	for _, i := range ids {
		arr := parts[i]
		var sb strings.Builder
		sb.WriteString(arr[0])
		c := seen[i]
		seen[i]++
		for k := 1; k < len(arr); k++ {
			v := store[slot{i, k - 1}]
			if c >= len(v) {
				fail("template slot values cut off")
			}
			sb.WriteString(v[c])
			sb.WriteString(arr[k])
		}
		out = append(out, sb.String())
	}
	return out
}
