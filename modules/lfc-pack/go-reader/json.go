// Copyright (c) 2026 LFC Foundry. MIT License.
package main

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// Obj is a JSON object that keeps the order keys were first seen. A repeated key keeps its first position and takes the last value, like JSON.parse.
type Obj struct {
	Keys []string
	Vals []any
	idx  map[string]int
}

func (o *Obj) find(k string) int {
	if o.idx != nil {
		if i, ok := o.idx[k]; ok {
			return i
		}
		return -1
	}
	for i, x := range o.Keys {
		if x == k {
			return i
		}
	}
	return -1
}

func (o *Obj) Set(k string, v any) {
	if i := o.find(k); i >= 0 {
		o.Vals[i] = v
		return
	}
	o.Keys = append(o.Keys, k)
	o.Vals = append(o.Vals, v)
	if o.idx != nil {
		o.idx[k] = len(o.Keys) - 1
	} else if len(o.Keys) > 12 {
		o.idx = make(map[string]int, 32)
		for i, x := range o.Keys {
			o.idx[x] = i
		}
	}
}

func (o *Obj) Get(k string) (any, bool) {
	if i := o.find(k); i >= 0 {
		return o.Vals[i], true
	}
	return nil, false
}

// Values are: nil, bool, float64, string, []any, *Obj. Strings are UTF-8, except that a lone UTF-16 surrogate is kept as its 3-byte (WTF-8) form so it can be written back as \udXXX.

type parser struct {
	b []byte
	p int
}

func parseJSON(b []byte) (v any, err error) {
	ps := &parser{b: b}
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("bad JSON at byte %d: %v", ps.p, r)
		}
	}()
	ps.ws()
	v = ps.value()
	ps.ws()
	if ps.p != len(ps.b) {
		panic("trailing text")
	}
	return v, nil
}

func (ps *parser) ws() {
	for ps.p < len(ps.b) && (ps.b[ps.p] == ' ' || ps.b[ps.p] == '\t' || ps.b[ps.p] == '\n' || ps.b[ps.p] == '\r') {
		ps.p++
	}
}

func (ps *parser) lit(s string, v any) any {
	if !strings.HasPrefix(string(ps.b[ps.p:min(len(ps.b), ps.p+len(s))]), s) {
		panic("unexpected character")
	}
	ps.p += len(s)
	return v
}

func (ps *parser) value() any {
	if ps.p >= len(ps.b) {
		panic("unexpected end")
	}
	switch c := ps.b[ps.p]; {
	case c == '{':
		ps.p++
		o := &Obj{}
		ps.ws()
		if ps.b[ps.p] == '}' {
			ps.p++
			return o
		}
		for {
			ps.ws()
			if ps.p >= len(ps.b) || ps.b[ps.p] != '"' {
				panic("expected key")
			}
			k := ps.str()
			ps.ws()
			if ps.p >= len(ps.b) || ps.b[ps.p] != ':' {
				panic("expected colon")
			}
			ps.p++
			ps.ws()
			o.Set(k, ps.value())
			ps.ws()
			if ps.p >= len(ps.b) {
				panic("unexpected end")
			}
			if ps.b[ps.p] == ',' {
				ps.p++
				continue
			}
			if ps.b[ps.p] == '}' {
				ps.p++
				return o
			}
			panic("expected , or }")
		}
	case c == '[':
		ps.p++
		a := []any{}
		ps.ws()
		if ps.b[ps.p] == ']' {
			ps.p++
			return a
		}
		for {
			ps.ws()
			a = append(a, ps.value())
			ps.ws()
			if ps.p >= len(ps.b) {
				panic("unexpected end")
			}
			if ps.b[ps.p] == ',' {
				ps.p++
				continue
			}
			if ps.b[ps.p] == ']' {
				ps.p++
				return a
			}
			panic("expected , or ]")
		}
	case c == '"':
		return ps.str()
	case c == 't':
		return ps.lit("true", true)
	case c == 'f':
		return ps.lit("false", false)
	case c == 'n':
		return ps.lit("null", nil)
	default:
		s := ps.p
		for ps.p < len(ps.b) && strings.IndexByte("+-0123456789.eE", ps.b[ps.p]) >= 0 {
			ps.p++
		}
		if s == ps.p {
			panic("unexpected character")
		}
		f, err := strconv.ParseFloat(string(ps.b[s:ps.p]), 64)
		if err != nil && !strings.Contains(err.Error(), "range") {
			panic(err)
		}
		return f
	}
}

func hex4(b []byte) rune {
	if len(b) < 4 {
		panic("short \\u escape")
	}
	n, err := strconv.ParseUint(string(b[:4]), 16, 32)
	if err != nil {
		panic("bad \\u escape")
	}
	return rune(n)
}

func appendWTF8(out []byte, r rune) []byte {
	if r >= 0xD800 && r <= 0xDFFF {
		return append(out, 0xED, byte(0x80|(r>>6)&0x3F), byte(0x80|r&0x3F))
	}
	return utf8.AppendRune(out, r)
}

func (ps *parser) str() string {
	ps.p++ // opening quote
	start := ps.p
	for ps.p < len(ps.b) && ps.b[ps.p] != '"' && ps.b[ps.p] != '\\' {
		ps.p++
	}
	if ps.p < len(ps.b) && ps.b[ps.p] == '"' {
		s := string(ps.b[start:ps.p])
		ps.p++
		return s
	}
	out := append([]byte{}, ps.b[start:ps.p]...)
	for {
		if ps.p >= len(ps.b) {
			panic("unterminated string")
		}
		c := ps.b[ps.p]
		if c == '"' {
			ps.p++
			return string(out)
		}
		if c != '\\' {
			out = append(out, c)
			ps.p++
			continue
		}
		ps.p++
		if ps.p >= len(ps.b) {
			panic("unterminated escape")
		}
		e := ps.b[ps.p]
		ps.p++
		switch e {
		case '"', '\\', '/':
			out = append(out, e)
		case 'b':
			out = append(out, '\b')
		case 'f':
			out = append(out, '\f')
		case 'n':
			out = append(out, '\n')
		case 'r':
			out = append(out, '\r')
		case 't':
			out = append(out, '\t')
		case 'u':
			r := hex4(ps.b[ps.p:])
			ps.p += 4
			if r >= 0xD800 && r < 0xDC00 && ps.p+6 <= len(ps.b) && ps.b[ps.p] == '\\' && ps.b[ps.p+1] == 'u' {
				if lo := hex4(ps.b[ps.p+2:]); lo >= 0xDC00 && lo <= 0xDFFF {
					ps.p += 6
					r = utf16.DecodeRune(r, lo)
				}
			}
			out = appendWTF8(out, r)
		default:
			panic("bad escape")
		}
	}
}

// ---------------------------------------------------------------- canonical text (what JSON.stringify gives)

func jsNumber(x float64) string {
	if x != x || x > 1.7976931348623157e308 || x < -1.7976931348623157e308 {
		return "null"
	}
	if x == 0 {
		return "0" // JSON.stringify(-0) is "0"
	}
	sign := ""
	if x < 0 {
		sign, x = "-", -x
	}
	e := strconv.FormatFloat(x, 'e', -1, 64) // d.ddde+XX, shortest digits that round-trip
	mant, exp, _ := strings.Cut(e, "e")
	digits := strings.Replace(mant, ".", "", 1)
	ex, _ := strconv.Atoi(exp)
	k, n := len(digits), ex+1 // value = 0.DIGITS x 10^n
	var r string
	switch {
	case k <= n && n <= 21:
		r = digits + strings.Repeat("0", n-k)
	case 0 < n && n <= 21:
		r = digits[:n] + "." + digits[n:]
	case -6 < n && n <= 0:
		r = "0." + strings.Repeat("0", -n) + digits
	default:
		s := "+"
		if n-1 < 0 {
			s = "-"
		}
		a := n - 1
		if a < 0 {
			a = -a
		}
		r = digits[:1]
		if k > 1 {
			r += "." + digits[1:]
		}
		r += "e" + s + strconv.Itoa(a)
	}
	return sign + r
}

func appendJSString(out []byte, s string) []byte {
	const hexd = "0123456789abcdef"
	out = append(out, '"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"':
			out = append(out, '\\', '"')
		case c == '\\':
			out = append(out, '\\', '\\')
		case c == '\b':
			out = append(out, '\\', 'b')
		case c == '\f':
			out = append(out, '\\', 'f')
		case c == '\n':
			out = append(out, '\\', 'n')
		case c == '\r':
			out = append(out, '\\', 'r')
		case c == '\t':
			out = append(out, '\\', 't')
		case c < 0x20:
			out = append(out, '\\', 'u', '0', '0', hexd[c>>4], hexd[c&15])
		case c == 0xED && i+2 < len(s) && s[i+1] >= 0xA0 && s[i+1] <= 0xBF: // lone surrogate in WTF-8
			u := 0xD000 | int(s[i+1]&0x3F)<<6 | int(s[i+2]&0x3F)
			out = append(out, '\\', 'u', hexd[u>>12], hexd[u>>8&15], hexd[u>>4&15], hexd[u&15])
			i += 2
		default:
			out = append(out, c)
		}
	}
	return append(out, '"')
}

// JavaScript lists keys that look like array indexes first, in numeric order.
func isIndexKey(k string) (uint64, bool) {
	if len(k) == 0 || len(k) > 10 || (len(k) > 1 && k[0] == '0') {
		return 0, false
	}
	for i := 0; i < len(k); i++ {
		if k[i] < '0' || k[i] > '9' {
			return 0, false
		}
	}
	n, _ := strconv.ParseUint(k, 10, 64)
	return n, n < 4294967295
}

func appendJSON(out []byte, v any) []byte {
	switch x := v.(type) {
	case nil:
		return append(out, "null"...)
	case bool:
		if x {
			return append(out, "true"...)
		}
		return append(out, "false"...)
	case float64:
		return append(out, jsNumber(x)...)
	case string:
		return appendJSString(out, x)
	case []any:
		out = append(out, '[')
		for i, e := range x {
			if i > 0 {
				out = append(out, ',')
			}
			out = appendJSON(out, e)
		}
		return append(out, ']')
	case *Obj:
		order := make([]int, 0, len(x.Keys))
		var idx []int
		for i, k := range x.Keys {
			if _, ok := isIndexKey(k); ok {
				idx = append(idx, i)
			}
		}
		if len(idx) > 0 {
			for a := 1; a < len(idx); a++ { // insertion sort by numeric value
				for b := a; b > 0; b-- {
					n1, _ := isIndexKey(x.Keys[idx[b-1]])
					n2, _ := isIndexKey(x.Keys[idx[b]])
					if n1 <= n2 {
						break
					}
					idx[b-1], idx[b] = idx[b], idx[b-1]
				}
			}
			isIdx := make(map[int]bool, len(idx))
			for _, i := range idx {
				isIdx[i] = true
			}
			order = append(order, idx...)
			for i := range x.Keys {
				if !isIdx[i] {
					order = append(order, i)
				}
			}
		} else {
			for i := range x.Keys {
				order = append(order, i)
			}
		}
		out = append(out, '{')
		for j, i := range order {
			if j > 0 {
				out = append(out, ',')
			}
			out = appendJSString(out, x.Keys[i])
			out = append(out, ':')
			out = appendJSON(out, x.Vals[i])
		}
		return append(out, '}')
	}
	panic(fmt.Sprintf("unsupported value %T", v))
}

// utf16Units is the UTF-16 code unit sequence of s (the writer hashes keys over code units).
func utf16Units(s string) []uint16 {
	out := make([]uint16, 0, len(s))
	for i := 0; i < len(s); {
		if s[i] == 0xED && i+2 < len(s) && s[i+1] >= 0xA0 && s[i+1] <= 0xBF {
			out = append(out, uint16(0xD000|int(s[i+1]&0x3F)<<6|int(s[i+2]&0x3F)))
			i += 3
			continue
		}
		r, w := utf8.DecodeRuneInString(s[i:])
		i += w
		if r >= 0x10000 {
			a, b := utf16.EncodeRune(r)
			out = append(out, uint16(a), uint16(b))
		} else {
			out = append(out, uint16(r))
		}
	}
	return out
}
