# Copyright (c) 2026 LFC Foundry. MIT License.
# rival files for the same taxi rows as taxis-300000.ndjson: Parquet (zstd-3, snappy) and Arrow IPC stream (uncompressed). Timestamps as timestamp[ms] (JS numbers), 64-bit ints narrowed to int32 so Arrow JS returns numbers, not BigInt.
# usage: PYTHONPATH=pyarrow python3 mkrival.py yellow.parquet outdir
import sys, pyarrow as pa, pyarrow.parquet as pq, pyarrow.compute as pc
T = pq.read_table(sys.argv[1]); t = T.slice(T.num_rows - 300000, 300000); t = t.take(pc.sort_indices(t, sort_keys=[('tpep_pickup_datetime', 'ascending')]))
cols = []
for f in t.schema:
    c = t[f.name]
    if pa.types.is_timestamp(f.type): c = c.cast(pa.timestamp('ms'))
    elif pa.types.is_int64(f.type): c = c.cast(pa.int32())
    elif pa.types.is_large_string(f.type): c = c.cast(pa.string())
    cols.append(c)
t = pa.table(cols, names=t.column_names); o = sys.argv[2]
pq.write_table(t, o + '/taxis-z3.parquet', compression='zstd', compression_level=3)
pq.write_table(t, o + '/taxis-sn.parquet', compression='snappy')
with pa.ipc.new_stream(o + '/taxis.arrows', t.schema) as w: w.write_table(t)
import os; [print(f, os.path.getsize(o + '/' + f)) for f in sorted(os.listdir(o))]
