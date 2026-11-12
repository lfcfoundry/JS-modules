# Copyright (c) 2026 LFC Foundry. MIT License.
# Parquet (pyarrow) size and native write/read time for the same taxi rows as the NDJSON slices (tail 300,000 rows; "sorted" = by pickup time; "head" = first 100,000).
# usage: PYTHONPATH=pyarrow python3 pqsize.py yellow_tripdata.parquet
import sys, time, io, pyarrow as pa, pyarrow.parquet as pq, pyarrow.compute as pc, statistics as st
pa.set_cpu_count(1); pa.set_io_thread_count(1)
T = pq.read_table(sys.argv[1]); tail = T.slice(T.num_rows - 300000, 300000)
sets = [('taxit-300000', tail), ('taxis-300000', tail.take(pc.sort_indices(tail, sort_keys=[('tpep_pickup_datetime', 'ascending')]))), ('taxi0-100000', T.slice(0, 100000))]
for f, t in sets:
    for name, kw in [('zstd-1 (default)', dict(compression='zstd')), ('zstd-3', dict(compression='zstd', compression_level=3)), ('snappy', dict(compression='snappy'))]:
        w, r = [], []
        for _ in range(5):
            b = io.BytesIO(); a = time.perf_counter(); pq.write_table(t, b, **kw); w.append(time.perf_counter() - a); data = b.getvalue()
            a = time.perf_counter(); pq.read_table(io.BytesIO(data), use_threads=False); r.append(time.perf_counter() - a)
        print('%-14s %-17s %9d  write %4.0f ms  read %4.0f ms' % (f, name, len(data), st.median(w) * 1000, st.median(r) * 1000), flush=True)
