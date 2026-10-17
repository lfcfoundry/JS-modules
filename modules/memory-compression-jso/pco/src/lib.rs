// Copyright (c) 2026 LFC Foundry. MIT License. Uses the `pco` crate (Pcodec), Apache-2.0, see NOTICE-pco.txt.
// Pcodec behind a tiny C interface. The page hands buffers in through mem_alloc and reads results through out_ptr.
// Only 64-bit floats (kind 0) and 32-bit signed integers (kind 2) are built in, which keeps the program near 327 KB.
use pco::standalone::{simple_compress, DecompressorItem, FileDecompressor};
use pco::ChunkConfig;
use std::alloc::{alloc, dealloc, Layout};

static mut OUT: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn mem_alloc(n: usize) -> *mut u8 { unsafe { alloc(Layout::from_size_align_unchecked(n.max(8), 8)) } }
#[no_mangle]
pub extern "C" fn mem_free(p: *mut u8, n: usize) { unsafe { dealloc(p, Layout::from_size_align_unchecked(n.max(8), 8)) } }
#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 { unsafe { (&*std::ptr::addr_of!(OUT)).as_ptr() } }

fn keep(v: Vec<u8>) -> usize { let l = v.len(); unsafe { *std::ptr::addr_of_mut!(OUT) = v; } l }

// Packs `n` numbers at `ptr`. kind 0: f64, kind 2: i32. Returns the packed length (the bytes are at out_ptr), or 0 on any error.
#[no_mangle]
pub extern "C" fn compress(kind: u32, ptr: *const u8, n: usize, level: u32) -> usize {
    let cfg = ChunkConfig::default().with_compression_level(level as usize);
    let r = unsafe {
        match kind {
            0 => simple_compress(std::slice::from_raw_parts(ptr as *const f64, n), &cfg),
            2 => simple_compress(std::slice::from_raw_parts(ptr as *const i32, n), &cfg),
            _ => return 0,
        }
    };
    match r { Ok(v) => keep(v), Err(_) => 0 }
}

macro_rules! decode {
    ($t:ty, $src:expr, $n:expr) => {{
        // Output size is fixed by the caller (`n`), never by the file: a chunk that would overflow it, a missing chunk or extra numbers all fail.
        let mut dst: Vec<$t> = vec![0 as $t; $n];
        let mut pos = 0usize;
        let ok = (|| -> Option<()> {
            let (fd, mut rest) = FileDecompressor::new($src).ok()?;
            loop {
                match fd.chunk_decompressor::<$t, _>(rest).ok()? {
                    DecompressorItem::Chunk(mut cd) => {
                        let cn = cd.n();
                        if cn == 0 || cn > $n - pos { return None; }
                        let p = cd.read(&mut dst[pos..pos + cn]).ok()?;
                        if p.n_processed != cn { return None; }
                        pos += cn;
                        rest = cd.into_src();
                    }
                    DecompressorItem::EndOfData(_) => break,
                }
            }
            if pos == $n { Some(()) } else { None }
        })();
        match ok {
            Some(()) => unsafe {
                let l = $n * std::mem::size_of::<$t>();
                let mut b = Vec::with_capacity(l);
                b.extend_from_slice(std::slice::from_raw_parts(dst.as_ptr() as *const u8, l));
                keep(b)
            },
            None => 0,
        }
    }};
}

// Unpacks exactly `n` numbers of `kind` from the `len` bytes at `ptr`. Returns the byte length of the result (at out_ptr), or 0 on any error.
#[no_mangle]
pub extern "C" fn decompress(kind: u32, ptr: *const u8, len: usize, n: usize) -> usize {
    if n == 0 { return 0; }
    let src = unsafe { std::slice::from_raw_parts(ptr, len) };
    match kind { 0 => decode!(f64, src, n), 2 => decode!(i32, src, n), _ => 0 }
}
