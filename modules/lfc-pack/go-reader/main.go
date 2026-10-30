//go:build !js

// Copyright (c) 2026 LFC Foundry. MIT License.
// lfcp-read: read an LFC-pack file (.json.lfc) and write NDJSON.
//
//	lfcp-read info FILE    rows, blocks, size, format version
//	lfcp-read rows FILE    canonical JSON, one row per line (what a value-exact file means)
//	lfcp-read text FILE    the NDJSON text: canonical for value-exact files, the original bytes for byte-exact files
package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "usage: lfcp-read info|rows|text FILE.json.lfc")
		os.Exit(2)
	}
	data, err := os.ReadFile(os.Args[2])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	f, err := Open(data)
	if err != nil {
		fmt.Fprintln(os.Stderr, "lfcp-read:", err)
		os.Exit(1)
	}
	w := bufio.NewWriterSize(os.Stdout, 1<<20)
	defer w.Flush()
	switch os.Args[1] {
	case "info":
		fmt.Fprintf(w, "rows=%d blocks=%d size=%d format=%d.%d\n", f.Rows(), len(f.blocks), len(data), f.major, f.minor)
		if len(os.Args) > 3 && os.Args[3] == "-v" { // decode everything once and list the flat column types met
			f.ReadRows()
			fmt.Fprintln(w, "column types:", colTypes)
		}
	case "rows":
		rows, err := f.ReadRows()
		if err != nil {
			w.Flush()
			fmt.Fprintln(os.Stderr, "lfcp-read:", err)
			os.Exit(1)
		}
		var buf []byte
		for _, r := range rows {
			buf = appendJSON(buf[:0], r)
			buf = append(buf, '\n')
			w.Write(buf)
		}
	case "text":
		t, err := f.ReadText()
		if err != nil {
			fmt.Fprintln(os.Stderr, "lfcp-read:", err)
			os.Exit(1)
		}
		w.Write(t)
	default:
		fmt.Fprintln(os.Stderr, "unknown command", os.Args[1])
		os.Exit(2)
	}
}
