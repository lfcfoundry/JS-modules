// Copyright (c) 2026 LFC Foundry. MIT License. Uses the `pco` crate (Pcodec), Apache-2.0.
// Pcodec behind a small C interface. Buffers live in the program's own memory: the page asks for space with `alloc`, fills it, calls in, and reads results in place.
// The "kind" argument is Pcodec's own number-type byte (the same byte the file stores): u32 1, u64 2, i32 3, i64 4, f32 5, f64 6, u16 7, i16 8.
// Every type and the packer are separate build features, so a build holds only what a page asks for.
#![allow(static_mut_refs)]
use pco::data_types::Number;
use pco::standalone::{DecompressorItem, FileDecompressor};
use std::alloc::{alloc as rs_alloc, dealloc, Layout};

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 { unsafe { rs_alloc(Layout::from_size_align_unchecked(n.max(8), 8)) } }
#[no_mangle]
pub extern "C" fn release(p: *mut u8, n: usize) { unsafe { dealloc(p, Layout::from_size_align_unchecked(n.max(8), 8)) } }

// Runs `$body` with the type alias `$T` set from the kind byte, or `$other` when this build does not hold that type.
macro_rules! dispatch {
    ($kind:expr, $T:ident, $body:expr, $other:expr) => {
        match $kind {
            #[cfg(feature = "u32")] 1 => { type $T = u32; $body }
            #[cfg(feature = "u64")] 2 => { type $T = u64; $body }
            #[cfg(feature = "i32")] 3 => { type $T = i32; $body }
            #[cfg(feature = "i64")] 4 => { type $T = i64; $body }
            #[cfg(feature = "f32")] 5 => { type $T = f32; $body }
            #[cfg(feature = "f64")] 6 => { type $T = f64; $body }
            #[cfg(feature = "u16")] 7 => { type $T = u16; $body }
            #[cfg(feature = "i16")] 8 => { type $T = i16; $body }
            _ => $other,
        }
    };
}

// Error codes (negative results): -1 bad kind or type not in this build, -2 corrupt or truncated data, -3 wrong count, -4 bad argument.

fn decode_all<T: Number>(src: &'static [u8], dst: &mut [T]) -> i32 {
    // Output size is fixed by the caller (`n`), never by the file: a chunk that would overflow it, a missing chunk or extra numbers all fail.
    let n = dst.len();
    let mut pos = 0usize;
    let ok = (|| -> Option<()> {
        let (fd, mut rest) = FileDecompressor::new(src).ok()?;
        loop {
            match fd.chunk_decompressor::<T, _>(rest).ok()? {
                DecompressorItem::Chunk(mut cd) => {
                    let cn = cd.n();
                    if cn == 0 || cn > n - pos { return None; }
                    let p = cd.read(&mut dst[pos..pos + cn]).ok()?;
                    if p.n_processed != cn { return None; }
                    pos += cn;
                    rest = cd.into_src();
                }
                DecompressorItem::EndOfData(_) => break,
            }
        }
        if pos == n { Some(()) } else { None }
    })();
    if ok.is_some() { n as i32 } else if pos != n { -2 } else { -3 }
}

// Unpacks exactly `n` numbers of `kind` from the `len` bytes at `src` straight into the `n * size` bytes at `dst`. Returns n, or a negative code.
#[no_mangle]
pub extern "C" fn decompress(kind: u32, src: *const u8, len: usize, dst: *mut u8, n: usize) -> i32 {
    if n == 0 || n > 0x1FFF_FFFF { return -4; }
    let s: &'static [u8] = unsafe { std::slice::from_raw_parts(src, len) };
    dispatch!(kind, T, {
        let d = unsafe { std::slice::from_raw_parts_mut(dst as *mut T, n) };
        decode_all::<T>(s, d)
    }, -1)
}

// The number type and the count a file announces (the count is only a hint). Returns the kind byte, or a negative code. The count goes to `n_out` when it is not null.
#[no_mangle]
pub extern "C" fn peek(src: *const u8, len: usize, n_out: *mut u32) -> i32 {
    let s: &'static [u8] = unsafe { std::slice::from_raw_parts(src, len) };
    match FileDecompressor::new(s) {
        Ok((fd, rest)) => {
            if !n_out.is_null() { unsafe { *n_out = fd.n_hint().min(u32::MAX as usize) as u32; } }
            match fd.uniform_type() {
                Some(t) => t as u8 as i32,
                None => match fd.peek_number_type_or_termination(rest) { Ok(Some(t)) => t as u8 as i32, Ok(None) => 0, Err(_) => -2 },
            }
        }
        Err(_) => -2,
    }
}

// ---- Streaming: unpack a file a few hundred numbers at a time, with no big output buffer. ----
trait Stream { fn read(&mut self, dst: *mut u8, cap: usize) -> i32; }
struct St<T: Number> { fd: FileDecompressor, rest: &'static [u8], cd: Option<pco::standalone::ChunkDecompressor<T, &'static [u8]>> }
impl<T: Number> Stream for St<T> {
    fn read(&mut self, dst: *mut u8, cap: usize) -> i32 {
        if cap == 0 || cap % 256 != 0 { return -4; }
        if self.cd.is_none() {
            match self.fd.chunk_decompressor::<T, _>(self.rest) {
                Ok(DecompressorItem::Chunk(c)) => { if c.n() == 0 { return -2; } self.cd = Some(c); }
                Ok(DecompressorItem::EndOfData(r)) => { self.rest = r; return 0; }
                Err(_) => return -2,
            }
        }
        let cd = self.cd.as_mut().unwrap();
        let d = unsafe { std::slice::from_raw_parts_mut(dst as *mut T, cap) };
        match cd.read(d) {
            Ok(p) => {
                if p.n_processed == 0 { return -2; }
                if p.finished { self.rest = self.cd.take().unwrap().into_src(); }
                p.n_processed as i32
            }
            Err(_) => -2,
        }
    }
}
static mut STREAMS: Vec<Option<Box<dyn Stream>>> = Vec::new();

// Opens a stream over the `len` bytes at `src` (the caller keeps them in place until `stream_close`). Returns a handle (1 and up) or a negative code.
#[no_mangle]
pub extern "C" fn stream_open(kind: u32, src: *const u8, len: usize) -> i32 {
    let s: &'static [u8] = unsafe { std::slice::from_raw_parts(src, len) };
    let b: Option<Box<dyn Stream>> = dispatch!(kind, T, {
        match FileDecompressor::new(s) { Ok((fd, rest)) => Some(Box::new(St::<T> { fd, rest, cd: None }) as Box<dyn Stream>), Err(_) => return -2 }
    }, return -1);
    unsafe {
        let v = &mut STREAMS;
        for (i, slot) in v.iter_mut().enumerate() { if slot.is_none() { *slot = b; return i as i32 + 1; } }
        v.push(b);
        v.len() as i32
    }
}
// Fills up to `cap` numbers (a multiple of 256) at `dst`. Returns how many were written (always one chunk's worth at most), 0 at the end of the file, or a negative code.
#[no_mangle]
pub extern "C" fn stream_read(h: i32, dst: *mut u8, cap: usize) -> i32 {
    unsafe {
        match STREAMS.get_mut((h - 1) as usize) { Some(Some(s)) if h >= 1 => s.read(dst, cap), _ => -4 }
    }
}
#[no_mangle]
pub extern "C" fn stream_close(h: i32) {
    unsafe { if h >= 1 { if let Some(slot) = STREAMS.get_mut((h - 1) as usize) { *slot = None; } } }
}

// ---- Packing (only in builds with the `encode` feature). ----
#[cfg(feature = "encode")]
static mut OUT: Vec<u8> = Vec::new();
#[cfg(feature = "encode")]
#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 { unsafe { OUT.as_ptr() } }
#[cfg(feature = "encode")]
#[no_mangle]
pub extern "C" fn out_release() { unsafe { OUT = Vec::new(); } }
// Packs `n` numbers of `kind` at `ptr` at compression level `level` (0 to 12; 8 is Pcodec's default). Returns the packed length (the bytes are at out_ptr) or a negative code.
#[cfg(feature = "encode")]
#[no_mangle]
pub extern "C" fn compress(kind: u32, ptr: *const u8, n: usize, level: u32) -> i32 {
    if n == 0 || n > 0x1FFF_FFFF || level > 12 { return -4; }
    let cfg = pco::ChunkConfig::default().with_compression_level(level as usize);
    dispatch!(kind, T, {
        let a = unsafe { std::slice::from_raw_parts(ptr as *const T, n) };
        match pco::standalone::simple_compress(a, &cfg) {
            Ok(v) => { let l = v.len() as i32; unsafe { OUT = v; } l }
            Err(_) => -2,
        }
    }, -1)
}

// Like `compress`, but the caller picks the encoder's choices instead of letting Pcodec guess. Any Pcodec can read the result.
// mode: 0 auto, 1 classic, 2 float multiple (arg = base, for example 0.01), 3 float quantize (arg = bits), 4 whole-number multiple (arg = base), 5 dictionary.
// delta: 0 auto, 1 none, 2 consecutive differences (order 1 to 7), 3 lookback, 4 convolution (order 1 to 32).
#[cfg(feature = "encode")]
#[no_mangle]
pub extern "C" fn compress_cfg(kind: u32, ptr: *const u8, n: usize, level: u32, mode: u32, arg: f64, delta: u32, order: u32) -> i32 {
    if n == 0 || n > 0x1FFF_FFFF || level > 12 { return -4; }
    let m = match mode { 0 => pco::ModeSpec::Auto, 1 => pco::ModeSpec::Classic, 2 => pco::ModeSpec::TryFloatMult(arg), 3 => pco::ModeSpec::TryFloatQuant(arg as u32), 4 => pco::ModeSpec::TryIntMult(arg as u64), 5 => pco::ModeSpec::TryDict, _ => return -4 };
    let d = match delta { 0 => pco::DeltaSpec::Auto, 1 => pco::DeltaSpec::NoOp, 2 => pco::DeltaSpec::TryConsecutive(order as usize), 3 => pco::DeltaSpec::TryLookback, 4 => pco::DeltaSpec::TryConv1(order as usize), _ => return -4 };
    let cfg = pco::ChunkConfig::default().with_compression_level(level as usize).with_mode_spec(m).with_delta_spec(d);
    dispatch!(kind, T, {
        let a = unsafe { std::slice::from_raw_parts(ptr as *const T, n) };
        match pco::standalone::simple_compress(a, &cfg) {
            Ok(v) => { let l = v.len() as i32; unsafe { OUT = v; } l }
            Err(_) => -2,
        }
    }, -1)
}

// One slice packed as ONE chunk, so a big column can be packed on several workers: the pieces, joined in order, are the same bytes compress() writes for the whole column.
// `total` is the count of the whole column (it goes in the file header); flags: bit 0 also writes the file header, bit 1 also writes the end-of-file byte. Pass the first piece flag 1, the last piece flag 2 (one piece alone: 3).
// The slice must be one of the pages Pcodec itself would pick for the whole column (equal pages of at most 262,144 numbers; the page script in pcodec-js.js does the same sum).
#[cfg(feature = "encode")]
#[no_mangle]
pub extern "C" fn compress_part(kind: u32, ptr: *const u8, n: usize, level: u32, total: usize, flags: u32) -> i32 {
    if n == 0 || n > 0x1FFF_FFFF || total < n || total > 0x1FFF_FFFF || level > 12 || flags > 3 { return -4; }
    let cfg = pco::ChunkConfig::default().with_compression_level(level as usize).with_paging_spec(pco::PagingSpec::Exact(vec![n]));
    dispatch!(kind, T, {
        let a = unsafe { std::slice::from_raw_parts(ptr as *const T, n) };
        let fc = pco::standalone::FileCompressor::default().with_n_hint(total);
        let r: pco::errors::PcoResult<Vec<u8>> = (|| {
            let mut dst = Vec::new();
            if flags & 1 != 0 { fc.write_header(&mut dst)?; }
            let mut cc = fc.chunk_compressor(a, &cfg)?;
            cc.write(&mut dst)?;
            if flags & 2 != 0 { fc.write_footer(&mut dst)?; }
            Ok(dst)
        })();
        match r { Ok(v) => { let l = v.len() as i32; unsafe { OUT = v; } l } Err(_) => -2 }
    }, -1)
}
