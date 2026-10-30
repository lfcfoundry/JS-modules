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

## In a web page (`web/`)
`web/lfcp-go.js` is the same reader as a one-file JS module (Go compiled to WebAssembly, gzipped and embedded; needs only `'wasm-unsafe-eval'`, no network):

```js
await LfcpGo.init();
LfcpGo.info(bytes); LfcpGo.rows(bytes); LfcpGo.text(bytes);   // bytes = Uint8Array of a .json.lfc file; each throws on a file it refuses
```
`web/tester.html` runs the 8 vectors through it and compares with the expected rows, the original bytes and the JavaScript reader (`LfcPack.unpackText`); a file picker checks your own files the same way. Both are built by `sh web/build.sh` (Go 1.25, python3; the output is identical on every rebuild). Browser check: `node web/browser-check.js chromium|firefox|webkit` (or through `tools/test-runner/cli.js all`).
