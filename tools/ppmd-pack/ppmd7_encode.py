# Copyright (c) 2026 LFC Foundry. MIT License.
"""ppmd7_encode: a pure Python PPMd encoder, variant H ("PPMd7" as used by 7-Zip) with the 7z range coder.
MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/JNFoo/JS-modules
Version 2026.10.15.2215

    from ppmd7_encode import encode
    packed = encode(data, order=12, mem=1 << 20)     # bytes in, bytes out

It is a port of the public-domain C code by Igor Pavlov (Ppmd7.c, Ppmd7Enc.c and Ppmd.h from the 7-Zip / LZMA SDK), which is itself based on
Dmitry Shkarin's PPMd var.H. The output is byte for byte what that C encoder writes (the first byte is always 0), so any 7z-style PPMd7 decoder
can unpack it, including modules/ppmd-decode/ppmd-decode.js. The decoder must be given the same `order` and `mem`, because the model restarts when its
memory runs out. Standard library only; no compiled code. The model lives in one bytearray that is viewed as bytes, 16-bit words and 32-bit words
(little-endian machines only, which is every machine this tool is meant for); the heavy lifting is done with slices and C-level iterators.
"""
import sys
from itertools import compress

MAX_FREQ = 124
NUM_INDEXES = 38
DUMMY_SEE = 400
EXP_ESCAPE = (25, 14, 9, 7, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2)
INIT_BIN_ESC = (0x3CDD, 0x1F3F, 0x59BF, 0x48F3, 0x64A1, 0x5ABC, 0x6632, 0x6051)


def _tables():
    indx2units, units2indx = [0] * NUM_INDEXES, [0] * 128
    k = 0
    for i in range(NUM_INDEXES):
        for _ in range(4 if i >= 12 else (i >> 2) + 1):
            units2indx[k] = i
            k += 1
        indx2units[i] = k
    ns2bs = [0, 2] + [4] * 9 + [6] * (256 - 11)
    ns2indx = [0, 1, 2] + [0] * 253
    m, k = 3, 1
    for i in range(3, 256):
        ns2indx[i] = m
        k -= 1
        if k == 0:
            m += 1
            k = m - 2
    hb2flag = [0] * 64 + [8] * 192
    bin_init = [0] * (128 * 64)
    for i in range(128):
        for k in range(8):
            v = 16384 - INIT_BIN_ESC[k] // (i + 2)
            for m in range(0, 64, 8):
                bin_init[i * 64 + k + m] = v
    see_summ = [(5 * i + 10) << 3 for i in range(25) for _ in range(16)]
    return indx2units, units2indx, ns2bs, ns2indx, hb2flag, bin_init, see_summ


_INDX2UNITS, _UNITS2INDX, _NS2BS, _NS2INDX, _HB2FLAG, _BIN_INIT, _SEE_SUMM_INIT = _tables()
_FULL_MASK = b"\xff" * 256
_SEE_SHIFT_INIT = [3] * 400
_SEE_COUNT_INIT = [4] * 400
_INIT_STATES = b"".join(bytes((i, 1, 0, 0, 0, 0)) for i in range(256))


def encode(data, order=12, mem=1 << 20):
    """Compress `data` (bytes) with PPMd7 at the given model order (2..64) and model memory in bytes (2048 .. 2^31-48). Returns the 7z-style stream."""
    if sys.byteorder != "little":
        raise RuntimeError("ppmd7_encode needs a little-endian machine")
    if not (2 <= order <= 64) or not (2048 <= mem <= 2147483600):
        raise ValueError("order must be 2..64 and mem 2048..2147483600")
    data = bytes(data)
    indx2units, units2indx, ns2bs, ns2indx, hb2flag = _INDX2UNITS, _UNITS2INDX, _NS2BS, _NS2INDX, _HB2FLAG
    align = 4 - (mem & 3)
    u8 = bytearray(align + mem + 12)               # +12: the list head node used when free blocks are glued
    mv = memoryview(u8)
    u16 = mv.cast("H")
    u32 = mv.cast("I")
    free_list = [0] * NUM_INDEXES
    bin_summ = list(_BIN_INIT)
    see_summ = list(_SEE_SUMM_INIT) + [0]
    see_shift = [3] * 400 + [7]
    see_count = [4] * 400 + [64]
    exp_escape = EXP_ESCAPE
    full_mask = _FULL_MASK
    init_states = _INIT_STATES

    # model registers
    min_ctx = max_ctx = found = 0
    order_fall = init_esc = prev_success = hi_bits = 0
    run_length = init_rl = glue_count = 0
    lo_unit = hi_unit = text = units_start = 0
    # range encoder
    out = bytearray()
    low, rng, cache, cache_size = 0, 0xFFFFFFFF, 0, 1

    def shift_low():
        nonlocal low, cache, cache_size
        if low < 0xFF000000 or low > 0xFFFFFFFF:
            carry = low >> 32
            t = cache
            while True:
                out.append((t + carry) & 255)
                t = 255
                cache_size -= 1
                if cache_size == 0:
                    break
            cache = (low >> 24) & 255
        cache_size += 1
        low = (low & 0xFFFFFF) << 8

    # ---- sub-allocator ----
    def insert_node(node, indx):
        u32[node >> 2] = free_list[indx]
        free_list[indx] = node

    def remove_node(indx):
        node = free_list[indx]
        free_list[indx] = u32[node >> 2]
        return node

    def split_block(ptr, old_indx, new_indx):
        nu = indx2units[old_indx] - indx2units[new_indx]
        ptr += indx2units[new_indx] * 12
        i = units2indx[nu - 1]
        if indx2units[i] != nu:
            i -= 1
            k = indx2units[i]
            insert_node(ptr + k * 12, nu - k - 1)
        insert_node(ptr, i)

    def glue_free_blocks():
        nonlocal glue_count
        head = align + mem
        n = head
        glue_count = 255
        for i in range(NUM_INDEXES):
            nu = indx2units[i]
            nxt = free_list[i]
            free_list[i] = 0
            while nxt != 0:
                node = nxt
                u32[(node >> 2) + 1] = n
                u32[(n >> 2) + 2] = node
                n = node
                nxt = u32[node >> 2]
                u16[node >> 1] = 0
                u16[(node >> 1) + 1] = nu
        u16[head >> 1] = 1
        u32[(head >> 2) + 1] = n
        u32[(n >> 2) + 2] = head
        if lo_unit != hi_unit:
            u16[lo_unit >> 1] = 1
        while n != head:
            node = n
            nu = u16[(node >> 1) + 1]
            while True:
                node2 = node + nu * 12
                nu += u16[(node2 >> 1) + 1]
                if u16[node2 >> 1] != 0 or nu >= 0x10000:
                    break
                prev2 = u32[(node2 >> 2) + 2]
                next2 = u32[(node2 >> 2) + 1]
                u32[(prev2 >> 2) + 1] = next2
                u32[(next2 >> 2) + 2] = prev2
                u16[(node >> 1) + 1] = nu
            n = u32[(node >> 2) + 1]
        n = u32[(head >> 2) + 1]
        while n != head:
            node = n
            nxt = u32[(node >> 2) + 1]
            nu = u16[(node >> 1) + 1]
            while nu > 128:
                insert_node(node, NUM_INDEXES - 1)
                nu -= 128
                node += 128 * 12
            i = units2indx[nu - 1]
            if indx2units[i] != nu:
                i -= 1
                k = indx2units[i]
                insert_node(node + k * 12, nu - k - 1)
            insert_node(node, i)
            n = nxt

    def alloc_units_rare(indx):
        nonlocal glue_count, units_start
        if glue_count == 0:
            glue_free_blocks()
            if free_list[indx] != 0:
                return remove_node(indx)
        i = indx
        while True:
            i += 1
            if i == NUM_INDEXES:
                nb = indx2units[indx] * 12
                glue_count -= 1
                if units_start - text > nb:
                    units_start -= nb
                    return units_start
                return 0
            if free_list[i] != 0:
                break
        ret = remove_node(i)
        split_block(ret, i, indx)
        return ret

    def alloc_units(indx):
        nonlocal lo_unit
        if free_list[indx] != 0:
            return remove_node(indx)
        nb = indx2units[indx] * 12
        if nb <= hi_unit - lo_unit:
            ret = lo_unit
            lo_unit += nb
            return ret
        return alloc_units_rare(indx)

    def shrink_units(old_ptr, old_nu, new_nu):
        i0 = units2indx[old_nu - 1]
        i1 = units2indx[new_nu - 1]
        if i0 == i1:
            return old_ptr
        if free_list[i1] != 0:
            ptr = remove_node(i1)
            u8[ptr:ptr + new_nu * 12] = u8[old_ptr:old_ptr + new_nu * 12]
            insert_node(old_ptr, i0)
            return ptr
        split_block(old_ptr, i0, i1)
        return old_ptr

    # ---- model (re)initialization ----
    def restart_model():
        nonlocal text, hi_unit, lo_unit, units_start, glue_count, order_fall, run_length, init_rl, prev_success, min_ctx, max_ctx, found
        for i in range(NUM_INDEXES):
            free_list[i] = 0
        text = align
        hi_unit = text + mem
        lo_unit = units_start = hi_unit - (mem // 8 // 12) * 84
        glue_count = 0
        order_fall = order
        run_length = init_rl = -(order if order < 12 else 12) - 1
        prev_success = 0
        hi_unit -= 12
        min_ctx = max_ctx = hi_unit
        u32[(min_ctx >> 2) + 2] = 0
        u16[min_ctx >> 1] = 256
        u16[(min_ctx >> 1) + 1] = 257
        found = lo_unit
        u32[(min_ctx >> 2) + 1] = lo_unit
        lo_unit += 128 * 12
        u8[found:found + 1536] = init_states
        bin_summ[:] = _BIN_INIT
        see_summ[:400] = _SEE_SUMM_INIT
        see_shift[:400] = _SEE_SHIFT_INIT
        see_count[:400] = _SEE_COUNT_INIT

    # ---- model update ----
    def create_successors(skip):
        nonlocal hi_unit
        c = min_ctx
        fs = found
        up_branch = u16[(fs >> 1) + 1] | (u16[(fs >> 1) + 2] << 16)
        fsym = u8[fs]
        ps = [] if skip else [fs]
        while True:
            sfx = u32[(c >> 2) + 2]
            if sfx == 0:
                break
            c = sfx
            ns = u16[c >> 1]
            if ns != 1:
                s0_ = u32[(c >> 2) + 1]
                s = s0_ + 6 * u8[s0_:s0_ + 6 * ns:6].find(fsym)
            else:
                s = c + 2
            successor = u16[(s >> 1) + 1] | (u16[(s >> 1) + 2] << 16)
            if successor != up_branch:
                c = successor
                if not ps:
                    return c
                break
            ps.append(s)
        up_sym = u8[up_branch]
        ns = u16[c >> 1]
        if ns == 1:
            up_freq = u8[c + 3]
        else:
            s0_ = u32[(c >> 2) + 1]
            s = s0_ + 6 * u8[s0_:s0_ + 6 * ns:6].find(up_sym)
            cf = u8[s + 1] - 1
            s0 = (u16[(c >> 1) + 1] - ns - cf) & 0xFFFFFFFF
            if 2 * cf <= s0:
                up_freq = 1 + (1 if 5 * cf > s0 else 0)
            else:
                up_freq = 1 + (2 * cf + 3 * s0 - 1) // (2 * s0)
            up_freq &= 255
        up_succ = up_branch + 1
        up_lo, up_hi = up_succ & 0xFFFF, up_succ >> 16
        while ps:
            if hi_unit != lo_unit:
                hi_unit -= 12
                c1 = hi_unit
            elif free_list[0] != 0:
                c1 = remove_node(0)
            else:
                c1 = alloc_units_rare(0)
                if c1 == 0:
                    return 0
            u16[c1 >> 1] = 1
            u8[c1 + 2] = up_sym
            u8[c1 + 3] = up_freq
            u16[(c1 >> 1) + 2] = up_lo
            u16[(c1 >> 1) + 3] = up_hi
            u32[(c1 >> 2) + 2] = c
            p = ps.pop() >> 1
            u16[p + 1] = c1 & 0xFFFF
            u16[p + 2] = c1 >> 16
            c = c1
        return c

    def update_model():
        nonlocal min_ctx, max_ctx, text, order_fall
        fs = found
        fsym = u8[fs]
        ffreq = u8[fs + 1]
        fsucc = u16[(fs >> 1) + 1] | (u16[(fs >> 1) + 2] << 16)
        mc = min_ctx
        if ffreq < 31 and u32[(mc >> 2) + 2] != 0:
            c = u32[(mc >> 2) + 2]
            n = u16[c >> 1]
            if n == 1:
                if u8[c + 3] < 32:
                    u8[c + 3] += 1
            else:
                s = u32[(c >> 2) + 1]
                if u8[s] != fsym:
                    s += 6 * u8[s:s + 6 * n:6].find(fsym)
                    if u8[s + 1] >= u8[s - 5]:
                        a = s >> 1
                        t0, t1, t2 = u16[a], u16[a + 1], u16[a + 2]
                        u16[a], u16[a + 1], u16[a + 2] = u16[a - 3], u16[a - 2], u16[a - 1]
                        u16[a - 3], u16[a - 2], u16[a - 1] = t0, t1, t2
                        s -= 6
                if u8[s + 1] < MAX_FREQ - 9:
                    u8[s + 1] += 2
                    u16[(c >> 1) + 1] += 2
        if order_fall == 0:
            min_ctx = max_ctx = create_successors(True)
            if min_ctx == 0:
                restart_model()
                return
            p = found >> 1
            u16[p + 1] = min_ctx & 0xFFFF
            u16[p + 2] = min_ctx >> 16
            return
        u8[text] = fsym
        text += 1
        successor = text
        if text >= units_start:
            restart_model()
            return
        if fsucc != 0:
            if fsucc <= successor:
                cs = create_successors(False)
                if cs == 0:
                    restart_model()
                    return
                fsucc = cs
            order_fall -= 1
            if order_fall == 0:
                successor = fsucc
                if max_ctx != min_ctx:
                    text -= 1
        else:
            p = found >> 1
            u16[p + 1] = successor & 0xFFFF
            u16[p + 2] = successor >> 16
            fsucc = min_ctx
        ns = u16[min_ctx >> 1]
        s0 = u16[(min_ctx >> 1) + 1] - ns - (ffreq - 1)
        succ_lo, succ_hi = successor & 0xFFFF, successor >> 16
        c = max_ctx
        while c != min_ctx:
            ns1 = u16[c >> 1]
            if ns1 != 1:
                if (ns1 & 1) == 0:
                    old_nu = ns1 >> 1
                    i = units2indx[old_nu - 1]
                    if i != units2indx[old_nu]:
                        ptr = alloc_units(i + 1)
                        if ptr == 0:
                            restart_model()
                            return
                        old_ptr = u32[(c >> 2) + 1]
                        u8[ptr:ptr + old_nu * 12] = u8[old_ptr:old_ptr + old_nu * 12]
                        insert_node(old_ptr, i)
                        u32[(c >> 2) + 1] = ptr
                sfq = u16[(c >> 1) + 1]
                sfq += (1 if 2 * ns1 < ns else 0) + (2 if (4 * ns1 <= ns and sfq <= 8 * ns1) else 0)
            else:
                s = alloc_units(0)
                if s == 0:
                    restart_model()
                    return
                u8[s:s + 6] = u8[c + 2:c + 8]
                u32[(c >> 2) + 1] = s
                f = u8[s + 1]
                f = f << 1 if f < 30 else MAX_FREQ - 4
                u8[s + 1] = f
                sfq = f + init_esc + (1 if ns > 3 else 0)
            cf = 2 * ffreq * (sfq + 6)
            sf = s0 + sfq
            if cf < 6 * sf:
                cf = 1 + (1 if cf > sf else 0) + (1 if cf >= 4 * sf else 0)
                sfq += 3
            else:
                cf = 4 + (1 if cf >= 9 * sf else 0) + (1 if cf >= 12 * sf else 0) + (1 if cf >= 15 * sf else 0)
                sfq += cf
            u16[(c >> 1) + 1] = sfq
            s = u32[(c >> 2) + 1] + ns1 * 6
            p = s >> 1
            u16[p + 1] = succ_lo
            u16[p + 2] = succ_hi
            u8[s] = fsym
            u8[s + 1] = cf
            u16[c >> 1] = ns1 + 1
            c = u32[(c >> 2) + 2]
        max_ctx = min_ctx = fsucc

    def rescale():
        nonlocal found
        mc = min_ctx
        stats = u32[(mc >> 2) + 1]
        s = found
        tmp = u8[s:s + 6]
        if s != stats:
            u8[stats + 6:s + 6] = u8[stats:s]
        u8[stats:stats + 6] = tmp
        s = stats
        esc_freq = u16[(mc >> 1) + 1] - u8[s + 1]
        f = (u8[s + 1] + 4 + (1 if order_fall != 0 else 0)) >> 1
        adder = 1 if order_fall != 0 else 0
        u8[s + 1] = f
        sum_freq = f
        i = u16[mc >> 1] - 1
        while True:
            s += 6
            f = u8[s + 1]
            esc_freq -= f
            f = (f + adder) >> 1
            u8[s + 1] = f
            sum_freq += f
            if f > u8[s - 5]:
                tmp = u8[s:s + 6]
                s1 = s
                while True:
                    u8[s1:s1 + 6] = u8[s1 - 6:s1]
                    s1 -= 6
                    if s1 == stats or f <= u8[s1 - 5]:
                        break
                u8[s1:s1 + 6] = tmp
            i -= 1
            if i == 0:
                break
        if u8[s + 1] == 0:
            num_stats0 = u16[mc >> 1]
            while True:
                i += 1
                s -= 6
                if u8[s + 1] != 0:
                    break
            esc_freq += i
            u16[mc >> 1] = num_stats0 - i
            if num_stats0 - i == 1:
                sym0, f0 = u8[stats], u8[stats + 1]
                lo_s, hi_s = u16[(stats >> 1) + 1], u16[(stats >> 1) + 2]
                while True:
                    f0 = f0 - (f0 >> 1)
                    esc_freq >>= 1
                    if esc_freq <= 1:
                        break
                insert_node(stats, units2indx[((num_stats0 + 1) >> 1) - 1])
                found = mc + 2
                u8[found] = sym0
                u8[found + 1] = f0
                u16[(found >> 1) + 1] = lo_s
                u16[(found >> 1) + 2] = hi_s
                return
            n0 = (num_stats0 + 1) >> 1
            n1 = (num_stats0 - i + 1) >> 1
            if n0 != n1:
                u32[(mc >> 2) + 1] = shrink_units(stats, n0, n1)
        u16[(mc >> 1) + 1] = sum_freq + esc_freq - (esc_freq >> 1)
        found = u32[(mc >> 2) + 1]

    # ---- the main loop ----
    restart_model()
    for sym in data:
        mc = min_ctx
        ns = u16[mc >> 1]
        if ns != 1:
            s = u32[(mc >> 2) + 1]
            sf = u16[(mc >> 1) + 1]
            f = u8[s + 1]
            if u8[s] == sym:
                # first symbol: low 0, size f
                rng = (rng // sf) * f
                while rng < 16777216:
                    rng <<= 8
                    shift_low()
                found = s
                prev_success = 1 if 2 * f > sf else 0
                run_length += prev_success
                u16[(mc >> 1) + 1] = sf + 4
                f += 4
                u8[s + 1] = f
                if f > MAX_FREQ:
                    rescale()
                fs = found
                nxt = u16[(fs >> 1) + 1] | (u16[(fs >> 1) + 2] << 16)
                if order_fall == 0 and nxt > text:
                    min_ctx = max_ctx = nxt
                else:
                    update_model()
                continue
            prev_success = 0
            n6 = ns * 6
            syms = u8[s:s + n6:6]
            idx = syms.find(sym)
            freqs = u8[s + 1:s + n6:6]
            if idx >= 0:
                lowv = sum(freqs[:idx])
                s += idx * 6
                f = freqs[idx]
                r = rng // sf
                low += lowv * r
                rng = r * f
                while rng < 16777216:
                    rng <<= 8
                    shift_low()
                found = s
                f += 4
                u8[s + 1] = f
                u16[(mc >> 1) + 1] = sf + 4
                if f > u8[s - 5]:
                    a = s >> 1
                    t0, t1, t2 = u16[a], u16[a + 1], u16[a + 2]
                    u16[a], u16[a + 1], u16[a + 2] = u16[a - 3], u16[a - 2], u16[a - 1]
                    u16[a - 3], u16[a - 2], u16[a - 1] = t0, t1, t2
                    s -= 6
                    found = s
                    if f > MAX_FREQ:
                        rescale()
                fs = found
                nxt = u16[(fs >> 1) + 1] | (u16[(fs >> 1) + 2] << 16)
                if order_fall == 0 and nxt > text:
                    min_ctx = max_ctx = nxt
                else:
                    update_model()
                continue
            hi_bits = hb2flag[u8[found]]
            tot = sum(freqs)
            r = rng // sf
            low += tot * r
            rng = r * (sf - tot)
            while rng < 16777216:
                rng <<= 8
                shift_low()
            mask = bytearray(full_mask)
            for c in syms:
                mask[c] = 0
        else:
            hi_bits = hb2flag[u8[found]]
            os_ = mc + 2
            osym = u8[os_]
            idx = ((u8[mc + 3] - 1) * 64 + prev_success + ns2bs[u16[u32[(mc >> 2) + 2] >> 1] - 1] + hi_bits + 2 * hb2flag[osym]
                   + (32 if run_length < 0 else 0))
            prob = bin_summ[idx]
            if osym == sym:
                rng = (rng >> 14) * prob
                while rng < 16777216:
                    rng <<= 8
                    shift_low()
                bin_summ[idx] = prob + 128 - ((prob + 32) >> 7)
                found = os_
                f = u8[mc + 3]
                if f < 128:
                    u8[mc + 3] = f + 1
                prev_success = 1
                run_length += 1
                nxt = u16[(os_ >> 1) + 1] | (u16[(os_ >> 1) + 2] << 16)
                if order_fall == 0 and nxt > text:
                    min_ctx = max_ctx = nxt
                else:
                    update_model()
                continue
            nb = (rng >> 14) * prob
            low += nb
            rng -= nb
            while rng < 16777216:
                rng <<= 8
                shift_low()
            prob -= (prob + 32) >> 7
            bin_summ[idx] = prob
            init_esc = exp_escape[prob >> 10]
            mask = bytearray(full_mask)
            mask[osym] = 0
            prev_success = 0
        # escape: walk down to shorter contexts, leaving out the symbols already ruled out
        while True:
            num_masked = u16[min_ctx >> 1]
            while True:
                order_fall += 1
                sfx = u32[(min_ctx >> 2) + 2]
                if sfx == 0:
                    raise AssertionError("symbol not found in the order-0 context")
                min_ctx = sfx
                if u16[sfx >> 1] != num_masked:
                    break
            mc = min_ctx
            ns = u16[mc >> 1]
            non_masked = ns - num_masked
            if ns != 256:
                d = u16[u32[(mc >> 2) + 2] >> 1] - ns
                see = (ns2indx[non_masked - 1] * 16 + (1 if (d < 0 or non_masked < d) else 0) + (2 if u16[(mc >> 1) + 1] < 11 * ns else 0)
                       + (4 if num_masked > non_masked else 0) + hi_bits)
                r = see_summ[see] >> see_shift[see]
                see_summ[see] -= r
                esc_freq = r if r else 1
            else:
                see = DUMMY_SEE
                esc_freq = 1
            s = u32[(mc >> 2) + 1]
            n6 = ns * 6
            syms = u8[s:s + n6:6]
            freqs = u8[s + 1:s + n6:6]
            idx = syms.find(sym)
            maskget = mask.__getitem__
            if idx >= 0:
                total = sum(compress(freqs, map(maskget, syms)))
                lowv = sum(compress(freqs[:idx], map(maskget, syms[:idx]))) if idx else 0
                f = freqs[idx]
                r = rng // (total + esc_freq)
                low += lowv * r
                rng = r * f
                while rng < 16777216:
                    rng <<= 8
                    shift_low()
                sh = see_shift[see]
                if sh < 7:
                    k = (see_count[see] - 1) & 255
                    see_count[see] = k
                    if k == 0:
                        see_summ[see] = (see_summ[see] << 1) & 0xFFFF
                        see_count[see] = (3 << sh) & 255
                        see_shift[see] = sh + 1
                found = s + idx * 6
                u16[(mc >> 1) + 1] += 4
                f += 4
                u8[found + 1] = f
                if f > MAX_FREQ:
                    rescale()
                run_length = init_rl
                update_model()
                break
            total = sum(compress(freqs, map(maskget, syms)))
            r = rng // (total + esc_freq)
            low += total * r
            rng = r * esc_freq
            while rng < 16777216:
                rng <<= 8
                shift_low()
            see_summ[see] = (see_summ[see] + total + esc_freq) & 0xFFFF
            for c in syms:
                mask[c] = 0
    for _ in range(5):
        shift_low()
    return bytes(out)


def encode_job(args):
    """For a process pool: (data, order, mem) in, (order, mem, stream) out."""
    data, order, mem = args
    return order, mem, encode(data, order, mem)


if __name__ == "__main__":
    import time
    if len(sys.argv) < 3:
        sys.exit("usage: python3 ppmd7_encode.py IN OUT [ORDER] [MEM_BYTES]")
    raw = open(sys.argv[1], "rb").read()
    t = time.time()
    z = encode(raw, int(sys.argv[3]) if len(sys.argv) > 3 else 12, int(sys.argv[4]) if len(sys.argv) > 4 else 1 << 20)
    dt = time.time() - t
    open(sys.argv[2], "wb").write(z)
    print("%d -> %d bytes in %.2f s (%.1f KB/s)" % (len(raw), len(z), dt, len(raw) / 1024.0 / max(dt, 1e-9)))
