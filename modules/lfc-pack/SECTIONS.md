# LFC-pack footer section registry (draft)

One place to see which footer section ids are taken. Rules are in `SPEC.md` 2.2 and `INTEROP.md` 3. Add a row in the same pull request that starts using an id.

## Format ids (1 to 999)
| Id | Name | Status | Required | Where described |
|---|---|---|---|---|
| 1 | header | written | yes | `SPEC.md` 2.3 |
| 2 | block table | written | yes | `SPEC.md` 2.3, 2.4 |
| 3 | row index | reserved | no | idea 2 in the format ideas list |
| 4 | Bloom filter | reserved | no | `SPEC.md` 2.3 |
| 5 | zone maps | written | no | `SPEC.md` 2.3, `LAYOUT-SPEC.md` 4 |
| 6 | metadata | written when `meta` is given (packer option) | no | `SPEC.md` 2.3, `PROPOSAL-metadata-section.md` |
| 7 | record-type map | reserved | no | design notes |
| 8 | (never used) | reserved forever | | `SPEC.md` 2.2 |
| 9 | raw-line store | written (byte-exact files) | yes when present | `SPEC.md` 2.3 |
| 10 | whole-file hash | reserved | no | design notes |
| 11 | per-block hash algorithm | reserved | no | design notes |
| 12 | feature flags | written | yes | `SPEC.md` 2.3 |
| 13 | (never used) | reserved forever | | `SPEC.md` 2.2 |
| 14 | file hash (older name) | reserved | no | design notes |
| 15 | number spellings | written (byte-exact files) | yes when present | `SPEC.md` 2.3 |
| 16 | shared tables | written (`share: true`) | yes when present | `LAYOUT-SPEC.md` 3.6 |
| 17 to 999 | later parts of this format | reserved | | |

## Application ids (1000 and up)
Pick the next free id, put your app name and a version inside the payload, and make the section optional unless the file is meaningless without it.

| Id | App | Payload | Notes |
|---|---|---|---|
| 1000 | (free) | | |
