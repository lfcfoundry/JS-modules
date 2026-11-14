# Credits

The fastest parts of these modules stand on published ideas and, in two places, on outside code. This page lists them in one place. Each module's README has the same credits in its "Prior art and credits" section, which is shown as "Credits" on its web page.

Links were checked on 2026-11-14. Paper links go through doi.org or arXiv.

## Outside code shipped inside a module

| Module | Code | Authors | License |
|---|---|---|---|
| [lfc-pack](modules/lfc-pack/README.md) | [Zstandard](https://facebook.github.io/zstd/), compiled unchanged to WebAssembly | Yann Collet and Meta Platforms | BSD-3-Clause ([NOTICE-zstd.txt](modules/lfc-pack/NOTICE-zstd.txt)) |
| [pcodec-js](modules/pcodec-js/README.md) | Pcodec 1.0.4, compiled to WebAssembly, plus one small patch | Martin Loncaric and contributors (github.com/pcodec/pcodec) | Apache-2.0 ([NOTICE-pcodec.txt](modules/pcodec-js/NOTICE-pcodec.txt)) |
| [ppmd-decode](modules/ppmd-decode/README.md) | PPMd variant H, ported to JavaScript | Dmitry Shkarin; cleaned up by Igor Pavlov in the [LZMA SDK](https://www.7-zip.org/sdk.html) | Public domain |

## Published ideas, written from scratch here

| Idea | Original authors and source | Used in |
|---|---|---|
| Zstandard format | Collet and Kucherawy, [RFC 8878](https://www.rfc-editor.org/rfc/rfc8878) | lfc-pack |
| XXH64 hash | Yann Collet, [xxhash.com](https://xxhash.com/) | lfc-pack |
| FNV-1a hash | Fowler, Noll and Vo, [FNV page](http://www.isthe.com/chongo/tech/comp/fnv/index.html) | lfc-pack, save-kit |
| CRC-32 with slicing tables | Peterson 1961; Kounavis and Berry 2005 | lfc-pack, zip-open, memory-compression |
| LEB128 varints, ZigZag | [Protocol Buffers encoding](https://protobuf.dev/programming-guides/encoding/) (Google) | lfc-pack, memory-compression |
| Frame of reference + bit packing | Goldstein, Ramakrishnan and Shaft, [ICDE 1998](https://doi.org/10.1109/ICDE.1998.655800); Lemire and Boytsov, [2015](https://arxiv.org/abs/1209.2137) | lfc-pack |
| Columns with per-block min/max | [Apache Parquet](https://parquet.apache.org/), [Apache ORC](https://orc.apache.org/), DuckDB [zone maps](https://duckdb.org/2022/10/28/lightweight-compression) | lfc-pack |
| Nested-data shredding | Melnik et al., [Dremel](https://research.google/pubs/dremel-interactive-analysis-of-web-scale-datasets-2/), Google 2010 | lfc-pack |
| Log templates | He et al., [Drain](https://doi.org/10.1109/ICWS.2017.13), ICWS 2017 | lfc-pack |
| ALP decimals | Afroozeh, Kuffo and Boncz, [SIGMOD 2024](https://doi.org/10.1145/3626717) | memory-compression |
| FSST text codes | Boncz, Neumann and Leis, [VLDB 2020](https://doi.org/10.14778/3407790.3407851) | memory-compression |
| Byte shuffle | Blosc | memory-compression |
| LZ4 block format | Yann Collet, [lz4.org](https://lz4.org/) | memory-compression |
| Deflate | [RFC 1951](https://www.rfc-editor.org/rfc/rfc1951) | memory-compression, zip-open, save-kit |
| LZMA | Igor Pavlov, [LZMA SDK](https://www.7-zip.org/sdk.html) | lzma-decode |
| Elias-Fano lists | Elias, [JACM 1974](https://doi.org/10.1145/321812.321820); Fano 1971; Vigna, [WSDM 2013](https://arxiv.org/abs/1206.6347) | elias-fano |
| Layered drawing | Sugiyama, Tagawa and Toda, [IEEE SMC 1981](https://doi.org/10.1109/TSMC.1981.4308636) | netflow-layers, netflow-engine |
| Cycle breaking | Eades, Lin and Smyth, [IPL 1993](https://doi.org/10.1016/0020-0190(93)90079-O) | netflow-layers |
| Barycenter, median and transpose ordering | Gansner, Koutsofios, North and Vo, [IEEE TSE 1993](https://graphviz.org/documentation/TSE93.pdf) ([Graphviz](https://graphviz.org/) dot) | netflow-layers |
| Sifting | Matuszewski, Schonfeld and Molitor, [GD 1999](https://doi.org/10.1007/3-540-46648-7_3) | netflow-layers (`sift`) |
| Crossing counting | Barth, Junger and Mutzel, [JGAA 2004](https://doi.org/10.7155/jgaa.00088); Fenwick, [1994](https://doi.org/10.1002/spe.4380240306) | netflow-layers, netflow-sankey, netflow-circular |
| Weighted Sankey crossings and ordering | Dwyer et al.; Zhang et al. (see the module) | netflow-sankey |
| Stress by gradient descent | Zheng, Pawar and Goodman, [2018](https://arxiv.org/abs/1710.04626) | netflow-engine |
| Barnes-Hut | Barnes and Hut, [Nature 1986](https://doi.org/10.1038/324446a0) | netflow-engine |
| Dominator tree | Cooper, Harvey and Kennedy, 2001 | netflow-engine |
| Edge bundles | Holten, [IEEE TVCG 2006](https://doi.org/10.1109/TVCG.2006.147) | netflow-circular |
| Squarified treemaps | Bruls, Huizing and van Wijk, [2000](https://doi.org/10.1007/978-3-7091-6783-0_4) | netflow-hierarchy |
| Tidy trees | Reingold and Tilford, [1981](https://doi.org/10.1109/TSE.1981.234519); Buchheim, Junger and Leipert, [2002](https://doi.org/10.1007/3-540-36151-0_32) | netflow-hierarchy |
| Circle packing | Wang et al., [CHI 2006](https://doi.org/10.1145/1124772.1124851); Welzl, [1991](https://doi.org/10.1007/BFb0038202) | netflow-hierarchy |
| Betweenness | Brandes, [2001](https://doi.org/10.1080/0022250X.2001.9990249) | graph-walk |
| Louvain communities | Blondel et al., [2008](https://doi.org/10.1088/1742-5468/2008/10/P10008) | graph-walk |
| k-core | Batagelj and Zaversnik, [2003](https://arxiv.org/abs/cs/0310049) | graph-walk |
| SCC, topological order, shortest paths, spanning tree, max flow, PageRank | Tarjan [1972](https://doi.org/10.1137/0201010); Kahn [1962](https://doi.org/10.1145/368996.369025); Dijkstra [1959](https://doi.org/10.1007/BF01386390); Kruskal [1956](https://doi.org/10.1090/S0002-9939-1956-0078686-7); Dinic 1970; Page, Brin, Motwani and Winograd 1998 | graph-walk |
| LZW and median cut | Welch, [1984](https://doi.org/10.1109/MC.1984.1659158); Heckbert, [1982](https://doi.org/10.1145/800064.801294); [GIF89a](https://www.w3.org/Graphics/GIF/spec-gif89a.txt) | gif-writer |
| Zip format | PKWARE [APPNOTE](https://pkwaredownloads.blob.core.windows.net/pkware-general/Documentation/APPNOTE-6.3.9.TXT) | zip-open |
| Three box blurs as a Gaussian | Kutskir 2013; Jarosz | gpu-blur |

## Rivals we measure against

Rivals run only as comparisons. None of their code ships here. They are named, with versions, in each module's "Numbers" and credits sections. For example, lfc-pack is compared against Parquet readers and Arrow, memory-compression against msgpackr, cbor-x, FlatBuffers and bson, and netflow-layers against Graphviz and ELK.

---
Part of [JS-modules](README.md) · MIT License · Copyright (c) 2026 LFC Foundry
