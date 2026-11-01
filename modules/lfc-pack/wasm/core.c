/* Copyright (c) 2026 LFC Foundry. MIT License.
 * LFC-pack core for wasm32 (freestanding): the NDJSON block tokenizer, the string deduplicator and CRC32.
 * Tokenizer: walks UTF-8 bytes directly; builds the shape (skeleton) text, copies plain ASCII strings into the text stream, writes numbers to (pathHash, f64) streams.
 * Anything unusual makes run() stop at that row so JavaScript can handle it on the exact JavaScript path (fallback row).
 * Deduplicator: turns the NUL-joined string stream into distinct strings (first-use order) plus one u32 code per string, in place, from the tokenizer's own text buffer. */
#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif
typedef unsigned char u8; typedef unsigned int u32; typedef unsigned long long u64; typedef double f64;
#define EXPORT(n) __attribute__((export_name(n)))
#define IN_CAP   (48u<<20)
#define TEXT_CAP (48u<<20)
#define NUM_CAP  (4u<<20)
#define SIDE_CAP (1u<<19)
#define ROW_CAP  (1u<<18)
#define SK_CAP   (1u<<20)
#define SHAPE_CAP (16u<<20)
#define SHAPE_N  (1u<<16)
#define MAXD 100
static u8 IN[IN_CAP]; static u8 TEXT[TEXT_CAP]; static f64 NUMV[NUM_CAP]; static u32 NUMP[NUM_CAP];
static u32 SIDE[SIDE_CAP*3]; static u32 IDS[ROW_CAP]; static u32 ROWSTART[ROW_CAP]; static u32 ROWEND[ROW_CAP]; static u8 SK[SK_CAP];
static u8 SHAPES[SHAPE_CAP]; static u32 SHOFF[SHAPE_N+1]; static u32 SHTAB[SHAPE_N*2]; static u32 SHSLOT[SHAPE_N]; // open addressing: [id+1]; SHSLOT: the slot each shape took, so reset clears only those
static u32 SLOWN[(1u<<19)*3]; static u32 slowN;
static u8 ODD[1u<<18]; static u32 odd; static u32 NODD[(1u<<20)*4]; static u32 nOddN, rowNumK, exactMode;
static u32 fbBeg;
static u32 lastShape=0xFFFFFFFFu; /* the shape the last row took (shapeFor) */
static u32 inLen, pos, textPos, numN, sideN, strN, rowN, skLen, shapeN, shapeBytes, fbStart, fbEnd;
static u32 KS_OBJ[8192], KS_PTR[8192], KS_LEN[8192]; static u32 ksGen, KS_GEN[8192], objSerial, rowKeys;
EXPORT("in_ptr") u8* in_ptr(void){return IN;} EXPORT("text_ptr") u8* text_ptr(void){return TEXT;}
EXPORT("numv_ptr") f64* numv_ptr(void){return NUMV;} EXPORT("nump_ptr") u32* nump_ptr(void){return NUMP;}
EXPORT("side_ptr") u32* side_ptr(void){return SIDE;} EXPORT("ids_ptr") u32* ids_ptr(void){return IDS;}
EXPORT("slown_ptr") u32* slown_ptr(void){return SLOWN;}
EXPORT("rowend_ptr") u32* rowend_ptr(void){return ROWEND;}
EXPORT("rowstart_ptr") u32* rowstart_ptr(void){return ROWSTART;}
EXPORT("sk_ptr") u8* sk_ptr(void){return SK;} EXPORT("shapes_ptr") u8* shapes_ptr(void){return SHAPES;} EXPORT("shoff_ptr") u32* shoff_ptr(void){return SHOFF;}
EXPORT("set_exact") void set_exact(u32 on){exactMode=on;}
EXPORT("nodd_ptr") u32* nodd_ptr(void){return NODD;}
EXPORT("odd_ptr") u8* odd_ptr(void){return ODD;}
EXPORT("state_ptr") u32* state_ptr(void){static u32 s[16]; s[0]=textPos;s[1]=numN;s[2]=sideN;s[3]=strN;s[4]=rowN;s[5]=shapeN;s[6]=fbStart;s[7]=fbEnd;s[8]=pos;s[9]=slowN;s[10]=fbBeg;s[11]=nOddN;return s;}
EXPORT("set_state") void set_state(u32 a,u32 b,u32 c,u32 d,u32 e){textPos=a;numN=b;sideN=c;strN=d;rowN=e;}
EXPORT("reset") void reset(u32 len){nOddN=0;inLen=len;pos=0;textPos=0;numN=0;sideN=0;slowN=0;strN=0;rowN=0;for(u32 i=0;i<shapeN;i++)SHTAB[SHSLOT[i]]=0;shapeN=0;lastShape=0xFFFFFFFFu;shapeBytes=0;SHOFF[0]=0;}
static inline u32 fnv(u32 h,u8 c){return (h^c)*16777619u;}
static u64 fnv64(const u8*p,u32 n){u64 h=1469598103934665603ull;for(u32 i=0;i<n;i++){h^=p[i];h*=1099511628211ull;}return h;}
static const f64 P10[]={1,1e1,1e2,1e3,1e4,1e5,1e6,1e7,1e8,1e9,1e10,1e11,1e12,1e13,1e14,1e15,1e16,1e17,1e18,1e19,1e20,1e21,1e22};
static inline void ws(void){while(pos<inLen){u8 c=IN[pos];if(c==' '||c=='\t'||c=='\r'){pos++;odd=1;}else break;}}
#define FAIL return 0
static int emitSk(u8 c){if(skLen>=SK_CAP)return 0;SK[skLen++]=c;return 1;}
static int pnum(u32 ph){
  u32 p=pos; int no=0; int neg=0; if(p<inLen&&IN[p]=='-'){neg=1;p++;}
  if(p>=inLen)FAIL; u64 m=0; u32 sig=0, frac=0; int slow=0;
  if(IN[p]=='0'){p++;} else if(IN[p]>='1'&&IN[p]<='9'){while(p<inLen&&IN[p]>='0'&&IN[p]<='9'){if(sig<15)m=m*10+(IN[p]-'0');sig++;p++;} if(sig>15)slow=1;} else FAIL;
  int hasFrac=0; if(p<inLen&&IN[p]=='.'){hasFrac=1;p++;u32 f0=p;while(p<inLen&&IN[p]>='0'&&IN[p]<='9'){if(!slow){m=m*10+(IN[p]-'0');if(m)sig++;if(sig>15)slow=1;}frac++;p++;} if(p==f0)FAIL; if(IN[p-1]=='0')no=1;}
  int ex=0; if(p<inLen&&(IN[p]=='e'||IN[p]=='E')){no=1;p++;int en=0;if(p<inLen&&(IN[p]=='+'||IN[p]=='-')){en=IN[p]=='-';p++;}u32 e0=p;while(p<inLen&&IN[p]>='0'&&IN[p]<='9'){if(ex<100000)ex=ex*10+(IN[p]-'0');p++;}if(p==e0)FAIL;if(en)ex=-ex;}
  if(numN>=NUM_CAP)FAIL;
  int e10=ex-(int)frac; f64 v=0;
  if(!slow){ v=(f64)m; if(e10<0){ if(-e10>22) slow=1; else v=v/P10[-e10]; } else if(e10>0){ if(e10>22) slow=1; else v=v*P10[e10]; } }
  if(neg&&m==0)no=1;
  if(slow){ no=1; if(slowN>=(1u<<19))FAIL; SLOWN[slowN*3]=numN;SLOWN[slowN*3+1]=pos;SLOWN[slowN*3+2]=p; slowN++; v=0; }
  else { if(neg)v=-v; if(hasFrac&&v>-1e-6&&v<1e-6)no=1; }
  NUMV[numN]=v; NUMP[numN]=ph; numN++; { u32 k=rowNumK++; if(no&&exactMode){ if(nOddN<(1u<<20)){NODD[nOddN*4]=rowN;NODD[nOddN*4+1]=k;NODD[nOddN*4+2]=pos;NODD[nOddN*4+3]=p;nOddN++;} else odd=1; } } pos=p; return 1;
}
#ifdef __wasm_simd128__
static inline u32 scanPlain(u32 p){ // first byte at or after p that is a quote, backslash, control or non-ASCII; inLen if none
  const v128_t q=wasm_i8x16_splat(34), bs=wasm_i8x16_splat(92), sp=wasm_i8x16_splat(32);
  while(p+16<=inLen){ v128_t v=wasm_v128_load(IN+p);
    v128_t m=wasm_v128_or(wasm_v128_or(wasm_i8x16_eq(v,q),wasm_i8x16_eq(v,bs)),wasm_v128_or(wasm_u8x16_lt(v,sp),wasm_i8x16_lt(v,wasm_i8x16_splat(0))));
    u32 b=wasm_i8x16_bitmask(m); if(b)return p+(u32)__builtin_ctz(b); p+=16; }
  while(p<inLen){u8 c=IN[p]; if(c==34||c==92||c<32||c>=0x80)return p; p++;}
  return p;
}
#else
static inline u32 scanPlain(u32 p){ while(p<inLen){u8 c=IN[p]; if(c==34||c==92||c<32||c>=0x80)return p; p++;} return p; }
#endif
static int pstr(void){ // pos at opening quote; writes text or side entry
  u32 s=pos+1, p=scanPlain(s); int plain=1;
  if(p>=inLen)FAIL;
  if(IN[p]!='"'){ plain=0; while(1){ if(p>=inLen)FAIL; u8 c=IN[p]; if(c=='"')break; if(c=='\\'){odd=1;p+=2;continue;} p++; } }
  u32 n=p-s;
  if(plain){ if(textPos+n+1>TEXT_CAP)FAIL; u32 i=0;
#ifdef __wasm_simd128__
    for(;i+16<=n;i+=16)wasm_v128_store(TEXT+textPos+i,wasm_v128_load(IN+s+i));
#endif
    for(;i<n;i++)TEXT[textPos+i]=IN[s+i]; textPos+=n; }
  else { if(sideN>=SIDE_CAP||textPos+1>TEXT_CAP)FAIL; SIDE[sideN*3]=strN;SIDE[sideN*3+1]=s;SIDE[sideN*3+2]=p; sideN++; }
  TEXT[textPos++]=0; strN++; pos=p+1; return 1;
}
static int lit(const char*w,u32 n){if(pos+n>inLen)FAIL;for(u32 i=0;i<n;i++)if(IN[pos+i]!=(u8)w[i])FAIL;pos+=n;return 1;}
static int pval(u32 d,u32 ph){
  ws(); if(pos>=inLen)FAIL; u8 c=IN[pos];
  if(c=='"'){ if(!pstr())FAIL; return emitSk('1'); }
  if(c=='-'||(c>='0'&&c<='9')){ if(!pnum(ph))FAIL; return emitSk('2'); }
  if(c=='t'){ if(!lit("true",4))FAIL; if(numN>=NUM_CAP)FAIL; NUMV[numN]=1;NUMP[numN]=fnv(ph,'?');numN++; return emitSk('3'); }
  if(c=='f'){ if(!lit("false",5))FAIL; if(numN>=NUM_CAP)FAIL; NUMV[numN]=0;NUMP[numN]=fnv(ph,'?');numN++; return emitSk('3'); }
  if(c=='n'){ if(!lit("null",4))FAIL; return emitSk('4'); }
  if(d>=MAXD)FAIL;
  if(c=='['){ pos++; if(!emitSk('['))FAIL; ws(); if(pos<inLen&&IN[pos]==']'){pos++;return emitSk(']');}
    u32 eph=fnv(fnv(ph,'['),']'); int first=1;
    for(;;){ if(!first&&!emitSk(','))FAIL; first=0; if(!pval(d+1,eph))FAIL; ws(); if(pos>=inLen)FAIL; if(IN[pos]==','){pos++;continue;} if(IN[pos]==']'){pos++;break;} FAIL; }
    return emitSk(']'); }
  if(c=='{'){ pos++; if(!emitSk('{'))FAIL; ws(); if(pos<inLen&&IN[pos]=='}'){pos++;return emitSk('}');}
    u32 obj=++objSerial; int first=1;
    for(;;){ ws(); if(pos>=inLen||IN[pos]!='"')FAIL; u32 p=pos+1,s=p; u32 h=fnv(ph,'.'); u32 kh=2166136261u;
      while(1){ if(p>=inLen)FAIL; u8 k=IN[p]; if(k=='"')break; if(k=='\\'||k>=0x80||k<0x20)FAIL; h=fnv(h,k); kh=fnv(kh,k); p++; }
      u32 kl=p-s; if(kl>200)FAIL; if(kl>0&&IN[s]>='0'&&IN[s]<='9')FAIL; if(kl==9&&IN[s]=='_'&&IN[s+1]=='_'&&IN[s+2]=='p')FAIL; /* __proto__ */
      if(rowKeys>=4096)FAIL; rowKeys++; u32 slot=(kh^(obj*2654435761u))&8191;
      for(;;){ if(KS_GEN[slot]!=ksGen){ KS_GEN[slot]=ksGen;KS_OBJ[slot]=obj;KS_PTR[slot]=s;KS_LEN[slot]=kl; break; }
        if(KS_OBJ[slot]==obj&&KS_LEN[slot]==kl){u32 same=1;for(u32 i=0;i<kl;i++)if(IN[KS_PTR[slot]+i]!=IN[s+i]){same=0;break;} if(same)FAIL;}
        slot=(slot+1)&8191; }
      if(!first&&!emitSk(','))FAIL; first=0; if(!emitSk('"'))FAIL; for(u32 i=0;i<kl;i++)if(!emitSk(IN[s+i]))FAIL; if(!emitSk('"')||!emitSk(':'))FAIL;
      pos=p+1; ws(); if(pos>=inLen||IN[pos]!=':')FAIL; pos++;
      if(!pval(d+1,h))FAIL; ws(); if(pos>=inLen)FAIL; if(IN[pos]==','){pos++;continue;} if(IN[pos]=='}'){pos++;break;} FAIL; }
    return emitSk('}'); }
  FAIL;
}
/* SF_LAST: try the previous row's shape first (rows mostly repeat it); SF_WORDS: compare 8 bytes at a time; SF_FASTHASH: hash 8 bytes per step. Ids are given in first-seen order either way, so the output does not change. */
#ifndef SF_LAST
#define SF_LAST 1
#endif
#ifndef SF_WORDS
#define SF_WORDS 1
#endif
#ifndef SF_FASTHASH
#define SF_FASTHASH 1
#endif
static inline u64 ld64(const u8*p){u64 v; __builtin_memcpy(&v,p,8); return v;}
static inline int sameBytes(const u8*a,const u8*b,u32 n){
#if SF_WORDS
  u32 i=0; for(;i+8<=n;i+=8) if(ld64(a+i)!=ld64(b+i)) return 0; for(;i<n;i++) if(a[i]!=b[i]) return 0; return 1;
#else
  for(u32 i=0;i<n;i++) if(a[i]!=b[i]) return 0; return 1;
#endif
}
static inline u32 shapeHash(const u8*s,u32 n){
#if SF_FASTHASH
  u64 h=0x9E3779B97F4A7C15ull^n; u32 i=0; for(;i+8<=n;i+=8){ h=(h^ld64(s+i))*0xff51afd7ed558ccdull; h^=h>>32; }
  u64 r=0; for(u32 k=0;i<n;i++,k+=8) r|=(u64)s[i]<<k; h=(h^r)*0xc4ceb9fe1a85ec53ull; h^=h>>29; return (u32)(h>>20);
#else
  return (u32)(fnv64(s,n)>>20);
#endif
}
static u32 shapeFor(const u8*s,u32 n){
#if SF_LAST
  if(lastShape<shapeN){ u32 a=SHOFF[lastShape]; if(SHOFF[lastShape+1]-a==n && sameBytes(SHAPES+a,s,n)) return lastShape; }
#endif
  u32 h=shapeHash(s,n)&(SHAPE_N*2-1);
  for(;;){ u32 t=SHTAB[h]; if(!t)break; u32 id=t-1; u32 a=SHOFF[id],l=SHOFF[id+1]-a; if(l==n && sameBytes(SHAPES+a,s,n)) return lastShape=id; h=(h+1)&(SHAPE_N*2-1); }
  if(shapeN>=SHAPE_N||shapeBytes+n>SHAPE_CAP)return 0xFFFFFFFFu;
  for(u32 i=0;i<n;i++)SHAPES[shapeBytes+i]=s[i]; SHOFF[shapeN]=shapeBytes; shapeBytes+=n; SHOFF[shapeN+1]=shapeBytes; SHTAB[h]=shapeN+1; SHSLOT[shapeN]=h; return lastShape=shapeN++;
}
EXPORT("commit_shape") u32 commit_shape(u32 n){return shapeFor(SK,n);}
// Parse rows from pos. Returns 0 when the block is done, 1 when row fbStart..fbEnd needs the JS path (rows before it are done), 2 on capacity error.
EXPORT("run") u32 run(void){
  while(pos<inLen){
    u32 lineBeg=pos; u32 ls=pos; while(ls<inLen&&(IN[ls]=='\n'||IN[ls]=='\r'||IN[ls]==' '||IN[ls]=='\t'))ls++; if(ls>=inLen){pos=inLen;break;}
    u32 le=ls; while(le<inLen&&IN[le]!='\n')le++; /* line end */
    u32 t0=textPos,n0=numN,s0=sideN,c0=strN,w0=slowN,no0=nOddN; pos=ls; skLen=0; ksGen++; rowKeys=0; odd=(ls!=lineBeg); rowNumK=0;
    int ok=pval(0,2166136261u); if(ok){ u32 p0=pos, o0=odd; ws(); if(pos<le && IN[pos]!='\r') ok=0; { u32 allcr=1; for(u32 q=p0;q<pos;q++)if(IN[q]!='\r')allcr=0; if(allcr&&pos==le)odd=o0; } }
    if(ok){ u32 id=shapeFor(SK,skLen); if(id==0xFFFFFFFFu)return 2; if(rowN>=ROW_CAP)return 2; IDS[rowN]=id; ROWSTART[rowN]=lineBeg; ROWEND[rowN]=le; ODD[rowN]=(u8)odd; rowN++; pos=le; if(pos<inLen)pos++; continue; }
    textPos=t0;numN=n0;sideN=s0;strN=c0;slowN=w0;nOddN=no0; fbStart=ls; fbBeg=lineBeg; fbEnd=le; pos=le; if(pos<inLen)pos++; return 1;
  }
  return 0;
}

/* ---- string deduplicator (reads the tokenizer's TEXT in place) ---- */
#define DD_OUT_CAP (48u<<20)
#define DD_MAXS (8u<<20)
#define DD_TBITS 22
static u8 DDOUT[DD_OUT_CAP+16] __attribute__((aligned(16))); static u32 DDCODES[DD_MAXS]; static u32 DDTAB[1u<<DD_TBITS]; static u32 DDOFF[DD_MAXS]; static u32 DDLEN[DD_MAXS];
static u32 ddN, ddOutLen;
/* ---- numbers grouped by path: a dense id per path hash (in first-seen order), then a stable counting sort, so JavaScript takes each column as one slice.
   Doing this in JavaScript cost a Map lookup per number (about 60 ns each in all three browsers). Returns the number of paths, or 0xFFFFFFFF when there are more than NG_MAX (the caller then groups in JavaScript). */
#define NG_TBITS 16
#define NG_MAX (1u<<15)
static u32 NGTAB[1u<<NG_TBITS]; static u32 NGHASH[NG_MAX], NGSLOT[NG_MAX], NGOFF[NG_MAX+1], NGPOS[NG_MAX];
/* scratch in DDOUT, which is free until dd_run (JavaScript copies the columns out first): the sorted numbers (8 bytes each), then the path ids (4 bytes each); NUMP stays as it was for the JavaScript fallback */
#define NUMS ((f64*)DDOUT)
_Static_assert(NUM_CAP*8u <= DD_OUT_CAP, "num_group scratch must fit in DDOUT");
EXPORT("ng_hash_ptr") u32* ng_hash_ptr(void){return NGHASH;} EXPORT("ng_off_ptr") u32* ng_off_ptr(void){return NGOFF;} EXPORT("nums_ptr") f64* nums_ptr(void){return NUMS;}
EXPORT("num_group") u32 num_group(u32 n){
  if(n>NUM_CAP) return 0xFFFFFFFFu;
  u32 ng=0, ok=1; const u32 mask=(1u<<NG_TBITS)-1;
  for(u32 i=0;i<n;i++){
    u32 h=NUMP[i], slot=(h*2654435761u)>>(32-NG_TBITS), id;
    for(;;){ u32 e=NGTAB[slot];
      if(e==0){ if(ng>=NG_MAX){ ok=0; break; } id=ng++; NGTAB[slot]=id+1; NGHASH[id]=h; NGSLOT[id]=slot; NGPOS[id]=0; break; }
      if(NGHASH[e-1]==h){ id=e-1; break; }
      slot=(slot+1)&mask; }
    if(!ok){ for(u32 j=0;j<i;j++) NUMP[j]=NGHASH[NUMP[j]]; break; }   /* too many paths: put the hashes back for the JS fallback */
    NUMP[i]=id; NGPOS[id]++;   /* the dense id replaces the hash in place (no separate scratch: 4 bytes per number less memory touched) */
  }
  for(u32 g=0;g<ng;g++) NGTAB[NGSLOT[g]]=0;
  if(!ok) return 0xFFFFFFFFu;
  u32 s=0; for(u32 g=0;g<ng;g++){ NGOFF[g]=s; u32 c=NGPOS[g]; NGPOS[g]=s; s+=c; } NGOFF[ng]=s;
  for(u32 i=0;i<n;i++) NUMS[NGPOS[NUMP[i]]++]=NUMV[i];
  return ng;
}


EXPORT("dd_out_ptr") u8* dd_out_ptr(void){return DDOUT;} EXPORT("dd_codes_ptr") u32* dd_codes_ptr(void){return DDCODES;}
EXPORT("dd_out_len") u32 dd_out_len(void){return ddOutLen;} EXPORT("dd_n") u32 dd_n(void){return ddN;}
static int ddEq(const u8*a,const u8*b,u32 n){ for(u32 i=0;i<n;i++) if(a[i]!=b[i]) return 0; return 1; }
/* input: TEXT[0..inlen) holding `count` NUL-terminated strings (the last terminator may be missing). Returns count, or 0xFFFFFFFF on overflow. */
EXPORT("dd_run") u32 dd_run(u32 inlen, u32 count){
  /* the hash table is sized to the strings of this call (at least twice their count, up to 2^DD_TBITS): clearing all 16 MB of it for every block cost more than the work itself on small blocks */
  u32 tb=10; while(tb<DD_TBITS && (1u<<tb)<count*2u) tb++;
  for(u32 i=0;i<(1u<<tb);i++) DDTAB[i]=0;
  ddN=0; ddOutLen=0; u32 pos=0; const u32 mask=(1u<<tb)-1;
  if(count>DD_MAXS) return 0xFFFFFFFFu;
  for(u32 s=0;s<count;s++){
    u32 st=pos; u64 h=1469598103934665603ull;
    while(pos<inlen && TEXT[pos]!=0){ h=(h^TEXT[pos])*1099511628211ull; pos++; }
    u32 len=pos-st; pos++;
    u32 slot=(u32)(h^(h>>29))&mask;
    for(;;){
      u32 e=DDTAB[slot];
      if(e==0){
        if(ddN>=DD_MAXS || ddOutLen+len+1>DD_OUT_CAP) return 0xFFFFFFFFu;
        DDOFF[ddN]=ddOutLen; DDLEN[ddN]=len; for(u32 i=0;i<len;i++) DDOUT[ddOutLen+i]=TEXT[st+i]; ddOutLen+=len; DDOUT[ddOutLen++]=0;
        DDTAB[slot]=ddN+1; DDCODES[s]=ddN; ddN++; break;
      }
      u32 d=e-1; if(DDLEN[d]==len && ddEq(DDOUT+DDOFF[d],TEXT+st,len)){ DDCODES[s]=d; break; }
      slot=(slot+1)&mask;
    }
  }
  return count;
}

/* ---- CRC32 (zlib polynomial), slice-by-8 ---- */
static u32 CRCT[8][256]; static int crcInit;
static void crcMake(void){ for(u32 n=0;n<256;n++){ u32 c=n; for(int k=0;k<8;k++) c=c&1?0xEDB88320u^(c>>1):c>>1; CRCT[0][n]=c; }
  for(u32 n=0;n<256;n++){ u32 c=CRCT[0][n]; for(int t=1;t<8;t++){ c=CRCT[0][c&255]^(c>>8); CRCT[t][n]=c; } } crcInit=1; }
/* crc of mem[p..p+n) continuing from crc `c` (pass 0 to start) */
EXPORT("crc32") u32 crc32_(const u8* p, u32 n, u32 c){
  if(!crcInit) crcMake(); c=~c;
  while(n>=8){ u32 a=c^(p[0]|(u32)p[1]<<8|(u32)p[2]<<16|(u32)p[3]<<24), b=p[4]|(u32)p[5]<<8|(u32)p[6]<<16|(u32)p[7]<<24;
    c=CRCT[7][a&255]^CRCT[6][(a>>8)&255]^CRCT[5][(a>>16)&255]^CRCT[4][a>>24]^CRCT[3][b&255]^CRCT[2][(b>>8)&255]^CRCT[1][(b>>16)&255]^CRCT[0][b>>24]; p+=8; n-=8; }
  while(n--) c=CRCT[0][(c^*p++)&255]^(c>>8);
  return ~c;
}
