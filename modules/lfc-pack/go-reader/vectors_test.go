// Copyright (c) 2026 LFC Foundry. MIT License.
package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Conformance (SPEC.md section 5): NAME.json.lfc decodes to the rows of NAME.ndjson; NAME.x.json.lfc returns the NDJSON bytes exactly.
// Rows are compared as canonical text of this program's own parser, so check_vectors.py repeats the value check with Python's json module.
func TestVectors(t *testing.T) {
	files, _ := filepath.Glob("../vectors/*.ndjson")
	if len(files) == 0 {
		t.Fatal("no vectors found")
	}
	for _, src := range files {
		base := strings.TrimSuffix(src, ".ndjson")
		raw, _ := os.ReadFile(src)
		var want [][]byte
		for _, l := range bytes.Split(raw, []byte{'\n'}) {
			if len(bytes.TrimSpace(l)) == 0 {
				continue
			}
			v, err := parseJSON(l)
			if err != nil {
				t.Fatalf("%s: %v", src, err)
			}
			want = append(want, appendJSON(nil, v))
		}
		for _, name := range []string{base + ".json.lfc", base + ".x.json.lfc"} {
			data, _ := os.ReadFile(name)
			f, err := Open(data)
			if err != nil {
				t.Fatalf("%s: %v", name, err)
			}
			rows, err := f.ReadRows()
			if err != nil || len(rows) != len(want) {
				t.Fatalf("%s: %d rows (%v), want %d", name, len(rows), err, len(want))
			}
			for i, r := range rows {
				if got := appendJSON(nil, r); !bytes.Equal(got, want[i]) {
					t.Errorf("%s row %d: %s want %s", name, i, got, want[i])
				}
			}
		}
		data, _ := os.ReadFile(base + ".x.json.lfc")
		f, _ := Open(data)
		if text, err := f.ReadText(); err != nil || !bytes.Equal(text, raw) {
			t.Errorf("%s.x: byte-exact text differs (%v)", base, err)
		}
	}
}
