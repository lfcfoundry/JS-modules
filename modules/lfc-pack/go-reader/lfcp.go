// Copyright (c) 2026 LFC Foundry. MIT License.
// Independent reader for LFC-pack files (.json.lfc). Written from SPEC.md and the block layouts in src/flat.js, src/nested.js and python/lfc_pack.py.
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"hash/crc32"
	"math"
	"runtime"
	"strconv"
	"strings"

	"github.com/klauspost/compress/zstd"
)

type readErr string

func (e readErr) Error() string { return string(e) }
func fail(f string, a ...any)   { panic(readErr(fmt.Sprintf(f, a...))) }

var zd, _ = zstd.NewReader(nil, zstd.WithDecoderConcurrency(1))

func unzstd(b []byte) []byte {
	out, err := zd.DecodeAll(b, nil)
	if err != nil {
		fail("zstd: %v", err)
	}
	return out
}

type blockEntry struct {
	off, ln, rows int
	crc           uint32
	kind          string
	table         int
}

type File struct {
	data    []byte
	major   int
	minor   int
	bodyEnd int
	sec     map[int][]byte
	blocks  []blockEntry
	header  *Obj
}

var knownSections = map[int]bool{1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 9: true, 10: true, 11: true, 12: true, 14: true, 15: true}

func num(v any) int {
	f, ok := v.(float64)
	if !ok || f != math.Trunc(f) {
		fail("expected an integer, got %v", v)
	}
	return int(f)
}

// Open checks the trailer, footer and block table (spec 2.1 to 2.4).
func Open(data []byte) (f *File, err error) {
	defer func() {
		if r := recover(); r != nil {
			if e, ok := r.(readErr); ok {
				f, err = nil, e
				return
			}
			if re, ok := r.(runtime.Error); ok {
				f, err = nil, readErr("damaged file: "+re.Error())
				return
			}
			panic(r)
		}
	}()
	n := len(data)
	if n < 17 || string(data[n-4:]) != "LFC1" {
		fail("not an LFC-pack file")
	}
	flen := int(binary.LittleEndian.Uint32(data[n-16:]))
	fcrc := binary.LittleEndian.Uint32(data[n-12:])
	major := int(binary.LittleEndian.Uint16(data[n-8:]))
	minor := int(binary.LittleEndian.Uint16(data[n-6:]))
	if major > 1 {
		fail("unsupported format major %d", major)
	}
	if flen > n-16 || flen < 1 {
		fail("footer length out of range")
	}
	foot := data[n-16-flen : n-16]
	if crc32.ChecksumIEEE(foot) != fcrc {
		fail("footer checksum mismatch")
	}
	var body []byte
	switch foot[0] {
	case 0:
		body = foot[1:]
	case 1:
		body = unzstd(foot[1:])
	default:
		fail("unknown footer encoding %d", foot[0])
	}
	f = &File{data: data, major: major, minor: minor, bodyEnd: n - 16 - flen, sec: map[int][]byte{}}
	for p := 0; p < len(body); {
		if p+8 > len(body) {
			fail("footer section header cut off")
		}
		id := int(binary.LittleEndian.Uint16(body[p:]))
		flags := int(binary.LittleEndian.Uint16(body[p+2:]))
		ln := int(binary.LittleEndian.Uint32(body[p+4:]))
		if p+8+ln > len(body) {
			fail("footer section %d cut off", id)
		}
		if knownSections[id] {
			f.sec[id] = body[p+8 : p+8+ln]
		} else if flags&1 != 0 {
			fail("required section %d not supported by this reader", id)
		}
		p += 8 + ln
	}
	tab, ok := f.sec[2]
	if !ok {
		fail("damaged file: block table missing")
	}
	tv, perr := parseJSON(tab)
	if perr != nil {
		fail("block table: %v", perr)
	}
	list, _ := tv.([]any)
	for i, e := range list {
		a, _ := e.([]any)
		if len(a) < 5 {
			fail("block table entry %d is short", i)
		}
		be := blockEntry{off: num(a[0]), ln: num(a[1]), crc: uint32(num(a[2])), rows: num(a[3])}
		be.kind, _ = a[4].(string)
		if len(a) > 5 {
			be.table = num(a[5])
		}
		f.blocks = append(f.blocks, be)
	}
	if h, ok := f.sec[1]; ok {
		hv, perr := parseJSON(h)
		if perr != nil {
			fail("header: %v", perr)
		}
		f.header, _ = hv.(*Obj)
	}
	return f, nil
}

func (f *File) Rows() int {
	if f.header != nil {
		if v, ok := f.header.Get("rows"); ok {
			return num(v)
		}
	}
	return -1
}

func (f *File) block(i int) (string, []byte) {
	be := f.blocks[i]
	if be.off < 0 || be.ln < 0 || be.off+be.ln > f.bodyEnd {
		fail("block %d out of range", i)
	}
	b := f.data[be.off : be.off+be.ln]
	if crc32.ChecksumIEEE(b) != be.crc {
		fail("block %d checksum mismatch", i)
	}
	return be.kind, b
}

func (f *File) blockRows(i int) (rows []any) {
	kind, b := f.block(i)
	switch kind {
	case "f":
		rows = readFlat(b)
	case "n":
		rows = readNested(b)
	case "r":
		for _, l := range bytes.Split(rawText(b), []byte{'\n'}) {
			if len(bytes.TrimSpace(l)) == 0 {
				continue
			}
			v, err := parseJSON(l)
			if err != nil {
				fail("raw row: %v", err)
			}
			rows = append(rows, v)
		}
	default:
		fail("block %d has unknown kind %q", i, kind)
	}
	return rows
}

func rawText(b []byte) []byte {
	if len(b) < 4 {
		fail("raw block too short")
	}
	return unzstd(b[4:])
}

// ReadRows returns every row, in order.
func (f *File) ReadRows() (rows []any, err error) {
	defer func() {
		if r := recover(); r != nil {
			if e, ok := r.(readErr); ok {
				rows, err = nil, e
				return
			}
			if re, ok := r.(runtime.Error); ok { // damaged lengths or tables that passed the checksums: refuse, do not crash
				rows, err = nil, readErr("damaged block: "+re.Error())
				return
			}
			panic(r)
		}
	}()
	for i := range f.blocks {
		rows = append(rows, f.blockRows(i)...)
	}
	return rows, nil
}

// ReadText returns the NDJSON text: canonical text for value-exact files, the original bytes for byte-exact files (spec 3.5).
func (f *File) ReadText() (text []byte, err error) {
	defer func() {
		if r := recover(); r != nil {
			if e, ok := r.(readErr); ok {
				text, err = nil, e
				return
			}
			if re, ok := r.(runtime.Error); ok {
				text, err = nil, readErr("damaged block: "+re.Error())
				return
			}
			panic(r)
		}
	}()
	tail := true
	if s, ok := f.sec[12]; ok {
		v, perr := parseJSON(s)
		if perr != nil {
			fail("feature flags: %v", perr)
		}
		if o, _ := v.(*Obj); o != nil {
			if t, ok := o.Get("tail"); ok && t == false {
				tail = false
			}
		}
	}
	exc := map[int]map[int][]byte{}
	if raw, ok := f.sec[9]; ok {
		if len(raw) < 4 {
			fail("raw-line store cut off")
		}
		hl := int(binary.LittleEndian.Uint32(raw))
		if 4+hl > len(raw) {
			fail("raw-line store cut off")
		}
		v, perr := parseJSON(raw[4 : 4+hl])
		if perr != nil {
			fail("raw-line store: %v", perr)
		}
		p := 4 + hl
		o, _ := v.(*Obj)
		if o != nil {
			for j, k := range o.Keys {
				bi, _ := strconv.Atoi(k)
				exc[bi] = map[int][]byte{}
				for _, e := range o.Vals[j].([]any) {
					pair := e.([]any)
					row, ln := num(pair[0]), num(pair[1])
					if p+ln > len(raw) {
						fail("raw-line store cut off")
					}
					exc[bi][row] = raw[p : p+ln]
					p += ln
				}
			}
		}
	}
	spell := map[int]map[int][]any{}
	if s, ok := f.sec[15]; ok {
		v, perr := parseJSON(s)
		if perr != nil {
			fail("number spellings: %v", perr)
		}
		if o, _ := v.(*Obj); o != nil {
			for j, k := range o.Keys {
				bi, _ := strconv.Atoi(k)
				spell[bi] = map[int][]any{}
				for _, e := range o.Vals[j].([]any) {
					pair := e.([]any)
					spell[bi][num(pair[0])] = pair[1].([]any)
				}
			}
		}
	}
	var out []byte
	for i := range f.blocks {
		kind, b := f.block(i)
		if kind == "r" {
			out = append(out, rawText(b)...)
			continue
		}
		var rows []any
		if kind == "f" {
			rows = readFlat(b)
		} else if kind == "n" {
			rows = readNested(b)
		} else {
			fail("block %d has unknown kind %q", i, kind)
		}
		for j, r := range rows {
			if x, ok := exc[i][j]; ok {
				out = append(out, x...)
			} else if sp, ok := spell[i][j]; ok {
				out = append(out, respell(appendJSON(nil, r), sp)...)
			} else {
				out = appendJSON(out, r)
			}
			out = append(out, '\n')
		}
	}
	if !tail && len(out) > 0 && f.blocks[len(f.blocks)-1].kind != "r" {
		out = out[:len(out)-1]
	}
	return out, nil
}

// respell swaps the listed number tokens (left to right, outside strings) of canonical row text for their original spelling.
func respell(canon []byte, spells []any) []byte {
	rep := map[int]string{}
	for _, e := range spells {
		pair := e.([]any)
		rep[num(pair[0])] = pair[1].(string)
	}
	var out []byte
	p, k, i := 0, 0, 0
	for i < len(canon) {
		c := canon[i]
		switch {
		case c == '"':
			i++
			for i < len(canon) && canon[i] != '"' {
				if canon[i] == '\\' {
					i++
				}
				i++
			}
			i++
		case c == '-' || (c >= '0' && c <= '9'):
			s := i
			if canon[i] == '-' {
				i++
			}
			if i < len(canon) && canon[i] == '0' {
				i++
			} else {
				for i < len(canon) && canon[i] >= '0' && canon[i] <= '9' {
					i++
				}
			}
			if i+1 < len(canon) && canon[i] == '.' && canon[i+1] >= '0' && canon[i+1] <= '9' {
				i++
				for i < len(canon) && canon[i] >= '0' && canon[i] <= '9' {
					i++
				}
			}
			if i < len(canon) && (canon[i] == 'e' || canon[i] == 'E') {
				j := i + 1
				if j < len(canon) && (canon[j] == '+' || canon[j] == '-') {
					j++
				}
				if j < len(canon) && canon[j] >= '0' && canon[j] <= '9' {
					for j < len(canon) && canon[j] >= '0' && canon[j] <= '9' {
						j++
					}
					i = j
				}
			}
			out = append(out, canon[p:s]...)
			if r, ok := rep[k]; ok {
				out = append(out, r...)
			} else {
				out = append(out, canon[s:i]...)
			}
			p = i
			k++
		default:
			i++
		}
	}
	out = append(out, canon[p:]...)
	return out
}

// ---------------------------------------------------------------- shared block helpers

type cursor struct {
	d []byte
	p int
}

func (c *cursor) take(n int) []byte {
	if n < 0 || c.p+n > len(c.d) {
		fail("block cut off")
	}
	x := c.d[c.p : c.p+n]
	c.p += n
	return x
}

func blockHeader(b []byte) (*Obj, int) {
	if len(b) < 4 {
		fail("block too short")
	}
	hl := int(binary.LittleEndian.Uint32(b))
	if 4+hl > len(b) {
		fail("block header cut off")
	}
	v, err := parseJSON(b[4 : 4+hl])
	if err != nil {
		fail("block header: %v", err)
	}
	o, _ := v.(*Obj)
	if o == nil {
		fail("block header is not an object")
	}
	return o, 4 + hl
}

func jsonOf(b []byte) any {
	v, err := parseJSON(b)
	if err != nil {
		fail("%v", err)
	}
	return v
}

func field(o *Obj, k string) any {
	v, ok := o.Get(k)
	if !ok {
		fail("missing field %q", k)
	}
	return v
}

func ints(v any) []int {
	a, _ := v.([]any)
	out := make([]int, len(a))
	for i, x := range a {
		out[i] = num(x)
	}
	return out
}

var itemSize = [7]int{1, 2, 4, 1, 2, 4, 8}

// typed reads n numbers of width kind: 0 u8, 1 u16, 2 u32, 3 i8, 4 i16, 5 i32, 6 f64 (little-endian).
// decimals decodes a width-7 number column: byte 0 is the decimals d (bits 0 to 3; bit 7: differences against the value k places back, k - 1 in bits 4 to 6), then n varints of the zigzag whole numbers; value = whole / 10^d.
func decimals(raw []byte, n int) []float64 {
	if len(raw) < 1 || n < 0 || n > len(raw) {
		fail("decimal column cut off")
	}
	d := int(raw[0] & 15)
	if d > 9 {
		fail("decimal column: too many decimals")
	}
	k := int((raw[0]>>4)&7) + 1
	sc := math.Pow(10, float64(d))
	u := varints(raw[1:], n)
	out := make([]float64, n)
	w := make([]int64, n)
	for i := range u {
		v := unzz(u[i])
		if raw[0]&128 != 0 && i >= k {
			v += w[i-k]
		}
		w[i] = v
		out[i] = float64(v) / sc
	}
	return out
}

func typed(raw []byte, kind, n int) []float64 {
	if kind < 0 || kind > 6 {
		fail("bad number kind %d", kind)
	}
	if n < 0 || n*itemSize[kind] > len(raw) {
		fail("number column cut off")
	}
	out := make([]float64, n)
	for i := range out {
		switch kind {
		case 0:
			out[i] = float64(raw[i])
		case 1:
			out[i] = float64(binary.LittleEndian.Uint16(raw[2*i:]))
		case 2:
			out[i] = float64(binary.LittleEndian.Uint32(raw[4*i:]))
		case 3:
			out[i] = float64(int8(raw[i]))
		case 4:
			out[i] = float64(int16(binary.LittleEndian.Uint16(raw[2*i:])))
		case 5:
			out[i] = float64(int32(binary.LittleEndian.Uint32(raw[4*i:])))
		case 6:
			out[i] = math.Float64frombits(binary.LittleEndian.Uint64(raw[8*i:]))
		}
	}
	return out
}

func bitunpack(b []byte, n, w int) []uint64 {
	out := make([]uint64, n)
	mask := uint64(1)<<uint(w) - 1
	if w >= 64 {
		fail("bit width too large")
	}
	bp := 0
	for i := 0; i < n; i++ {
		by := bp >> 3
		var v uint64
		for k := 0; k < 5; k++ {
			if by+k < len(b) {
				v |= uint64(b[by+k]) << uint(8*k)
			} else if k == 0 && w > 0 {
				fail("bit-packed column cut off")
			}
		}
		out[i] = (v >> uint(bp&7)) & mask
		bp += w
	}
	return out
}

func varints(b []byte, n int) []uint64 {
	out := make([]uint64, n)
	p := 0
	for i := 0; i < n; i++ {
		var u, m uint64 = 0, 1
		for {
			if p >= len(b) {
				fail("varint column cut off")
			}
			c := b[p]
			p++
			u += uint64(c&127) * m
			m *= 128
			if u > 1<<53 || m > 1<<56 {
				fail("varint over 2^53")
			}
			if c&128 == 0 {
				break
			}
		}
		out[i] = u
	}
	return out
}

func unzz(x uint64) int64 {
	if x%2 == 0 {
		return int64(x / 2)
	}
	return -int64((x + 1) / 2)
}

// fnv is FNV-1a over the UTF-16 code units of s: the hash the writer gives a column path.
func fnv(s string) uint32 {
	h := uint32(2166136261)
	for _, u := range utf16Units(s) {
		h = (h ^ uint32(u)) * 16777619
	}
	return h
}

func splitNul(b []byte) []string { return strings.Split(string(b), "\x00") }
