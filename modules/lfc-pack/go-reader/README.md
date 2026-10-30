# lfcp-read: a Go reader for LFC-pack

An independent reader for `.json.lfc` files. It needs only Go and one library (`klauspost/compress/zstd`, pure Go, no C). It builds to one static program.

```
go build -o lfcp-read .
lfcp-read info FILE.json.lfc     # rows, blocks, size, format version (add -v to list the column types met)
lfcp-read rows FILE.json.lfc     # canonical JSON, one row per line
lfcp-read text FILE.json.lfc     # the NDJSON text; the original bytes for a byte-exact file
```

Checks (about 4 seconds in all, no browser needed because nothing here is timed):

```
go test ./...                                          # the vectors, through this program's own parser
python3 -I check_vectors.py ./lfcp-read                # the vectors again, compared with Python's json module
python3 -I check_refusals.py ./lfcp-read               # damaged files are refused with a plain message
sh stress/compare.sh ./lfcp-read /tmp/lfcp-stress      # 40 files from the JavaScript writer must read the same as the JavaScript reader
```

Layout: `lfcp.go` (container, footer, byte-exact text, shared decoders), `flat.go` and `nested.go` (block layouts), `json.go` (order-keeping JSON parser and JavaScript-style writer).
