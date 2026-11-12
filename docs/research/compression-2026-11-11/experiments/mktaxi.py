# Copyright (c) 2026 LFC Foundry. MIT License.
# NYC TLC yellow taxi trips (public data) to NDJSON: timestamps as epoch milliseconds, nulls kept as null. usage: PYTHONPATH=pyarrow python3 mktaxi.py in.parquet rows out.ndjson [tail]
import sys, json, pyarrow.parquet as pq, pyarrow.compute as pc, pyarrow as pa
t = pq.read_table(sys.argv[1]); n = int(sys.argv[2]); t = t.slice(t.num_rows - n if len(sys.argv) > 4 and sys.argv[4] == "tail" else 0, n)
cols = {}
for n in t.column_names:
    c = t[n]
    if pa.types.is_timestamp(c.type): c = pc.divide(c.cast(pa.int64()), 1000)
    cols[n] = c.to_pylist()
with open(sys.argv[3], 'w') as f:
    for i in range(t.num_rows): f.write(json.dumps({n: cols[n][i] for n in t.column_names}, separators=(',', ':')) + '\n')
