# Footer section 6, metadata (implemented on branch claude/project-thread-cahtub: `pack(bytes, { meta })`, `LfcPack.metadata(bytes)`, `lfc_pack.metadata(path)`)

The packer copies the object it is given (adds `v: 1`, refuses over 64 KB); it does not fill `rows` or `type` itself. Tests: `test/meta.cjs`.

Goal: let any app show what a `.json.lfc` file holds (title, tables, column names and types, units, where it came from) by reading only the footer, without decoding a block.

## Payload
UTF-8 JSON, optional (flags 0), written by the packer when the caller supplies it:
```
{ "v": 1,
  "title": "string, optional",
  "about": "string, optional, plain text",
  "producer": "app name and version, optional",
  "schema": "name of a convention, for example netflow-map/links, optional",
  "tables": [ { "name": "rows", "rows": 123, "columns": [ { "key": "ts", "type": "number", "unit": "s", "note": "..." } ] } ] }
```
- `type` is one of `number`, `string`, `boolean`, `null`, `list`, `object`, `mixed`. It describes the values the producer meant; the blocks are the truth.
- `tables` follows the order of the header `tables` list (section 1). A single-table file uses one entry.
- Unknown keys MUST be kept and ignored by readers.

## Rules
- A reader MUST NOT trust it for decoding; decoding uses the blocks only.
- Size SHOULD stay under 64 KB; column lists for very wide files may be cut to the first 1,000 keys with `"columnsCut": true`.
- Public files MUST NOT carry private details in it (it is plain text in the footer, readable by anyone with the file).

## Open
- Whether the packer fills `rows` and `type` itself from the data (cheap; the writer already knows them) or only copies what the app gives.
- Whether column names should also be searchable without the zone maps. Not decided.
