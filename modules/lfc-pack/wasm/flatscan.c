// LFC-pack flat writer, fast path: scans NDJSON rows whose values are numbers (integers or decimals with a plain fraction), arrays of whole numbers, strings without escapes, true/false and null,
// straight from the text bytes. Anything else (nested objects, escapes in strings, exponents, blank lines, CR, duplicate keys, integer-like keys, __proto__) returns a bail code and the caller uses the JSON.parse path.
// No libc, no static buffers apart from two small tables; the caller lays every output array out in linear memory.
#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif
typedef unsigned char u8; typedef unsigned int u32; typedef unsigned long long u64; typedef long long i64;
#define EXPORT(n) __attribute__((export_name(n)))
#define MAXK 128
static u32 GWP[MAXK];
static u32 HT[512]; static u32 LASTROW[MAXK];
static u32 PRED[MAXK], KEXTRA[MAXK];   /* PRED[j]: the key that came j-th in the last row (rows mostly repeat their key order); KEXTRA: a key's UTF-8 bytes minus UTF-16 units */
static const double P10[19]={1,1e1,1e2,1e3,1e4,1e5,1e6,1e7,1e8,1e9,1e10,1e11,1e12,1e13,1e14,1e15,1e16,1e17,1e18};
// digits from in[p] on, 8 at a time: m = m*10^k + their value, *nd += k; returns the new p, or 0xFFFFFFFF when more than 15 digits in all
static const u64 P10U[9]={1,10,100,1000,10000,100000,1000000,10000000,100000000};
// B3 research: end of a strict JSON number token starting at p (any length, fraction, exponent, -0), or 0xFFFFFFFF when it is not one
static u32 numspan(const u8*in,u32 p,u32 len){
  if(p<len&&in[p]=='-') p++;
  if(p>=len||in[p]<'0'||in[p]>'9') return 0xFFFFFFFFu;
  if(in[p]=='0') p++; else while(p<len&&in[p]>='0'&&in[p]<='9') p++;
  if(p<len&&in[p]=='.'){ p++; if(p>=len||in[p]<'0'||in[p]>'9') return 0xFFFFFFFFu; while(p<len&&in[p]>='0'&&in[p]<='9') p++; }
  if(p<len&&(in[p]=='e'||in[p]=='E')){ p++; if(p<len&&(in[p]=='+'||in[p]=='-')) p++; if(p>=len||in[p]<'0'||in[p]>'9') return 0xFFFFFFFFu; while(p<len&&in[p]>='0'&&in[p]<='9') p++; }
  if(p<len&&in[p]>='0'&&in[p]<='9') return 0xFFFFFFFFu;
  return p;
}
static u32 digits(const u8*in,u32 p,u32 len,u64*m,u32*nd){
  while(p+8<=len){ u64 w; __builtin_memcpy(&w,in+p,8);
    u64 bad=((w&0xF0F0F0F0F0F0F0F0ULL)^0x3030303030303030ULL)|(((w+0x0606060606060606ULL)&0xF0F0F0F0F0F0F0F0ULL)^0x3030303030303030ULL);   /* nonzero in each byte that is not '0'-'9' (a carry only starts at such a byte) */
    u32 L=bad?((u32)__builtin_ctzll(bad)>>3):8;
    if(L==0) return p;
    if(*nd+L>15) return 0xFFFFFFFFu;
    u64 v=(w-0x3030303030303030ULL)<<(8*(8-L));   /* the L digits in the top bytes, zeros below: the usual 8-digit conversion */
    v=(v*10+(v>>8))&0x00FF00FF00FF00FFULL; v=(v*100+(v>>16))&0x0000FFFF0000FFFFULL; v=(v*10000+(v>>32))&0xFFFFFFFFULL;
    *m=*m*P10U[L]+v; *nd+=L; p+=L; if(L<8) return p; }
  while(p<len&&in[p]>='0'&&in[p]<='9'){ *m=*m*10+(in[p]-'0'); if(++*nd>15) return 0xFFFFFFFFu; p++; }
  return p;
}
// st: [0]=keys [1]=cells [2]=lists [3]=list values [4]=rows [5]=error position
// key outputs: keyoff/keylen (into the input), ktype (1 number, 2 list), kmaxfd (largest fraction digit count of the column)
// cell outputs, in row-major order: ckey (key id), cval (number: signed mantissa as double; list: index into llen), cfd (fraction digits, numbers only)
// list outputs: llen (length of each list), lval (values, pooled in the same order)
// ktype: 1 number, 2 list of whole numbers, 3 string without escapes (cval = start offset and clen = length, both in UTF-16 units of the decoded text; the caller has checked the bytes are valid UTF-8), 4 boolean (cval 1 or 0; cfd 2 marks a null in a boolean column), 5 null (every value of the column)
static u32 NLIT;   /* B3b: literal (mixed-kind) cells so far in this block */
EXPORT("scan") u32 scan(const u8*in,u32 len,u32 nrows,u8*planes,u32 pb,u32*keyoff,u32*keylen,u8*ktype,u8*kmaxfd,u32*st,u8*ckey,double*cval,u8*cfd,u32*llen,u32*lval,u32*clen,u32 allowstr,u32 first,u32 stop){
  /* resumable: first=1 starts at the top; with first=0 it goes on from the state in st. It returns 100 at the first row that starts at or after byte stop, so the caller
     scans a block in pieces: browsers only switch a wasm function from its quick first code to optimized code between calls, so one long call stays slow on a first pack */
  u32 p=0,row=0,nk=0,nc=0,nl=0,nlv=0,extra=0;   // extra = bytes minus UTF-16 units so far, for the strings' offsets in the decoded text
  if(first){ NLIT=0; for(u32 i=0;i<512;i++) HT[i]=0; for(u32 i=0;i<MAXK;i++){ LASTROW[i]=0xFFFFFFFFu; PRED[i]=0xFFFFFFFFu; } }
  else { nk=st[0]; nc=st[1]; nl=st[2]; nlv=st[3]; row=st[4]; p=st[5]; extra=st[6]; }
#define BAIL(c) do{ st[0]=nk; st[1]=nc; st[2]=nl; st[3]=nlv; st[4]=row; st[5]=p; st[6]=extra; return (c); }while(0)
#define WS while(p<len&&(in[p]==' '||in[p]=='\t')) p++
  while(p<len){
    if(p>=stop) BAIL(100);
    if(row>=nrows) BAIL(1);
    if(in[p]!='{') BAIL(2);
    p++; WS;
    u32 kpos=0;
    if(p<len&&in[p]=='}'){ p++; }
    else for(;;){
      if(p>=len||in[p]!='"') BAIL(3);
      u32 ks=++p, id=0xFFFFFFFFu;
      if(kpos<MAXK && PRED[kpos]!=0xFFFFFFFFu){   /* same key as in this place of the last row: compare its bytes, no hashing */
        u32 k=PRED[kpos], kl=keylen[k], a=keyoff[k];
        if(ks+kl<len && in[ks+kl]=='"'){ u32 z=0; while(z+8<=kl){ u64 x,y; __builtin_memcpy(&x,in+a+z,8); __builtin_memcpy(&y,in+ks+z,8); if(x!=y) break; z+=8; } while(z<kl&&in[a+z]==in[ks+z]) z++; if(z==kl){ id=k; p=ks+kl+1; extra+=KEXTRA[k]; } }
      }
      if(id==0xFFFFFFFFu){
      u32 h=2166136261u; u32 alld=1, ex0=extra;
      while(p<len&&in[p]!='"'){ u8 c=in[p]; if(c=='\\'||c<0x20) BAIL(4); if(c<'0'||c>'9') alld=0; if(c>=0xC0) extra+=(c>=0xE0)?2:1; h=(h^c)*16777619u; p++; }
      if(p>=len) BAIL(4);
      u32 kl=p-ks; p++;
      if(kl==0||alld) BAIL(5);   // integer-like keys are enumerated first by JavaScript: leave them to the other path
      if(kl==9){ const u8*q=in+ks; if(q[0]=='_'&&q[1]=='_'&&q[2]=='p'&&q[3]=='r'&&q[4]=='o'&&q[5]=='t'&&q[6]=='o'&&q[7]=='_'&&q[8]=='_') BAIL(5); }
      u32 slot=h&511;
      for(;;){ u32 e=HT[slot]; if(!e) break; u32 k=e-1; if(keylen[k]==kl){ u32 a=keyoff[k]; u32 z=0; while(z<kl&&in[a+z]==in[ks+z]) z++; if(z==kl){ id=k; break; } } slot=(slot+1)&511; }
      if(id==0xFFFFFFFFu){ if(nk>=MAXK) BAIL(6); id=nk++; HT[slot]=id+1; keyoff[id]=ks; keylen[id]=kl; ktype[id]=0; kmaxfd[id]=0; KEXTRA[id]=extra-ex0; }
      }
      if(kpos<MAXK) PRED[kpos]=id;
      kpos++;
      if(LASTROW[id]==row) BAIL(7);   // duplicate key in one row
      LASTROW[id]=row;
      WS; if(p>=len||in[p]!=':') BAIL(3); p++; WS;
      if(p>=len) BAIL(3);
      u8 c=in[p];
      if(ktype[id]==7) goto mixed;
      if(c=='['){
        if(ktype[id]==0) ktype[id]=2; else if(ktype[id]!=2) BAIL(8);
        p++; WS; u32 cnt=0;
        if(p<len&&in[p]==']') p++;
        else for(;;){
          u64 v=0; u32 d=0;
          if(p>=len||in[p]<'0'||in[p]>'9') BAIL(9);
          if(in[p]=='0'&&p+1<len&&in[p+1]>='0'&&in[p+1]<='9') BAIL(9);
          while(p<len&&in[p]>='0'&&in[p]<='9'){ v=v*10+(in[p]-'0'); if(++d>10) BAIL(9); p++; }
          if(p<len&&(in[p]=='.'||in[p]=='e'||in[p]=='E')) BAIL(9);
          if(v>4294967295ULL) BAIL(9);
          lval[nlv++]=(u32)v; cnt++;
          WS; if(p>=len) BAIL(3);
          if(in[p]==','){ p++; WS; continue; }
          if(in[p]==']'){ p++; break; }
          BAIL(3);
        }
        llen[nl]=cnt; ckey[nc]=(u8)id; cval[nc]=(double)nl; cfd[nc]=0; clen[nc]=0; nc++; nl++;
      } else if(c=='-'||(c>='0'&&c<='9')){
        if(ktype[id]==0) ktype[id]=1; else if(ktype[id]!=1&&ktype[id]!=6) goto mixed;
        u32 p0=p, neg=0; if(c=='-'){ neg=1; p++; }
        if(p>=len||in[p]<'0'||in[p]>'9') goto longnum;
        u64 m=0; u32 nd=0, fd=0;
        if(in[p]=='0'&&p+1<len&&in[p+1]>='0'&&in[p+1]<='9') goto longnum;
        { u32 q=digits(in,p,len,&m,&nd); if(q==0xFFFFFFFFu) goto longnum; p=q; }
        if(p<len&&in[p]=='.'){
          p++; if(p>=len||in[p]<'0'||in[p]>'9') goto longnum;
          { u32 n0=nd, q=digits(in,p,len,&m,&nd); if(q==0xFFFFFFFFu) goto longnum; fd+=nd-n0; p=q; }
          while(fd>0&&m%10==0){ m/=10; fd--; }   // 1.50 is 1.5 and 2.0 is the whole number 2, as JSON.parse sees them
        }
        if(p<len&&(in[p]=='e'||in[p]=='E')) goto longnum;
        if(neg&&m==0) goto longnum;   // -0
        if(fd>9) goto longnum;   /* up to 9 fraction digits, as the JSON.parse path's decimal scale */
        if(fd>kmaxfd[id]) kmaxfd[id]=(u8)fd;
        ckey[nc]=(u8)id; cval[nc]=neg?-(double)m:(double)m; cfd[nc]=(u8)fd; clen[nc]=0; nc++;
        if(0){ longnum: { u32 e=numspan(in,p0,len); if(e==0xFFFFFFFFu) BAIL(10); ktype[id]=6; ckey[nc]=(u8)id; cval[nc]=(double)p0; cfd[nc]=0; clen[nc]=e-p0; nc++; p=e; } }
      } else if(c=='"'){
        if(!allowstr) BAIL(16);
        if(ktype[id]==0) ktype[id]=3; else if(ktype[id]!=3) goto mixed;
        u32 ss=++p, ex0=extra, esc=0;
        while(p<len&&in[p]!='"'){ u8 ch=in[p]; if(ch<0x20) BAIL(16);
          if(ch=='\\'){   /* allowstr 2: escapes are let through (checked here, decoded by the caller); the cell gets cfd 1 and its key kmaxfd 1 */
            if(allowstr<2||p+1>=len) BAIL(16); u8 e=in[p+1];
            if(e=='u'){ if(p+5>=len) BAIL(16); for(u32 q=p+2;q<p+6;q++){ u8 x=in[q]; if(!((x>='0'&&x<='9')||(x>='a'&&x<='f')||(x>='A'&&x<='F'))) BAIL(16); } p+=6; }
            else if(e=='"'||e=='\\'||e=='/'||e=='b'||e=='f'||e=='n'||e=='r'||e=='t') p+=2; else BAIL(16);
            esc=1; continue; }
          if(ch>=0xC0) extra+=(ch>=0xE0)?2:1; p++; }
        if(p>=len) BAIL(16);
        ckey[nc]=(u8)id; cval[nc]=(double)(ss-ex0); clen[nc]=(p-ss)-(extra-ex0); cfd[nc]=(u8)esc; if(esc) kmaxfd[id]=1; nc++; p++;
      } else if(c=='t'||c=='f'){
        if(ktype[id]==0||ktype[id]==5) ktype[id]=4; else if(ktype[id]!=4) goto mixed;
        u32 isT=(c=='t');
        if(isT){ if(p+4>len||in[p+1]!='r'||in[p+2]!='u'||in[p+3]!='e') BAIL(17); p+=4; }
        else { if(p+5>len||in[p+1]!='a'||in[p+2]!='l'||in[p+3]!='s'||in[p+4]!='e') BAIL(17); p+=5; }
        ckey[nc]=(u8)id; cval[nc]=isT?1.0:0.0; cfd[nc]=0; nc++;
      } else if(c=='n'){
        if(ktype[id]==0) ktype[id]=5; else if(ktype[id]!=5&&ktype[id]!=4) goto mixed;   // null mixes with true/false
        if(p+4>len||in[p+1]!='u'||in[p+2]!='l'||in[p+3]!='l') BAIL(17);
        p+=4; ckey[nc]=(u8)id; cval[nc]=0.0; cfd[nc]=2; clen[nc]=0; nc++;
      } else BAIL(13);
      if(0){ mixed: {   /* B3b research: a key with values of more than one JSON kind becomes type 7; kmaxfd keeps its first type, and from here on each cell is the value's literal bytes (cfd 255), parsed by the caller */
        if(c=='['||c=='{'||ktype[id]==2) BAIL(8);
        if(ktype[id]!=7){ kmaxfd[id]=ktype[id]; ktype[id]=7; }
        u32 e;
        if(c=='"'){ if(!allowstr) BAIL(16); e=p+1; while(e<len&&in[e]!='"'){ u8 ch=in[e]; if(ch<0x20) BAIL(16); if(ch=='\\'){ if(allowstr<2) BAIL(16); e+=2; continue; } if(ch>=0xC0) extra+=(ch>=0xE0)?2:1; e++; } if(e>=len) BAIL(16); e++; }
        else if(c=='t'){ if(p+4>len||in[p+1]!='r'||in[p+2]!='u'||in[p+3]!='e') BAIL(17); e=p+4; }
        else if(c=='f'){ if(p+5>len||in[p+1]!='a'||in[p+2]!='l'||in[p+3]!='s'||in[p+4]!='e') BAIL(17); e=p+5; }
        else if(c=='n'){ if(p+4>len||in[p+1]!='u'||in[p+2]!='l'||in[p+3]!='l') BAIL(17); e=p+4; }
        else { e=numspan(in,p,len); if(e==0xFFFFFFFFu) BAIL(10); }
        ckey[nc]=(u8)id; cval[nc]=(double)p; clen[nc]=e-p; cfd[nc]=255; nc++; p=e; if(!(kmaxfd[id]==1&&(c=='n'||c=='-'||(c>='0'&&c<='9')))) NLIT++;   /* numbers and nulls in a number key are read in wasm (litnum), so they do not count against the fast path */
      } }
      planes[id*pb+(row>>3)]|=(u8)(1u<<(row&7));
      WS; if(p>=len) BAIL(3);
      if(in[p]==','){ p++; WS; continue; }
      if(in[p]=='}'){ p++; break; }
      BAIL(3);
    }
    WS;
    row++;
    if(!(row&4095)&&NLIT*2>nc) BAIL(18);   /* B3b: past half of the cells as literals, one JSON.parse of the block (the other writer) is no slower: stop early */
    if(p<len){ if(in[p]!='\n') BAIL(14); p++; }
  }
  if(row!=nrows) BAIL(15);
  if(NLIT*2>nc) BAIL(18);
  st[0]=nk; st[1]=nc; st[2]=nl; st[3]=nlv; st[4]=row; st[5]=p; st[6]=extra;
  return 0;
}
EXPORT("count") u32 count(const u8*in,u32 len,u32*out){   // newlines, colons, commas: bounds for the output arrays; out[3] is 1 when some byte is 128 or more
  /* 8 bytes at a time: a byte equal to t becomes 0 in w^T, and Z() sets the top bit of exactly the zero bytes (no carries between bytes), so a popcount counts them */
  u32 nl=0,co=0,cm=0,hi=0,i=0; u64 H=0;
#ifdef __wasm_simd128__   /* the SIMD build (flatscan.wasm) counts 16 bytes a step; flatscan-plain.wasm keeps the 8-byte steps below, same counts */
  { v128_t vn=wasm_i8x16_splat(10), vc=wasm_i8x16_splat(58), vm=wasm_i8x16_splat(44), hv=wasm_i8x16_splat(0);
    for(;i+16<=len;i+=16){ v128_t w=wasm_v128_load(in+i);
      nl+=(u32)__builtin_popcount(wasm_i8x16_bitmask(wasm_i8x16_eq(w,vn))); co+=(u32)__builtin_popcount(wasm_i8x16_bitmask(wasm_i8x16_eq(w,vc))); cm+=(u32)__builtin_popcount(wasm_i8x16_bitmask(wasm_i8x16_eq(w,vm)));
      hv=wasm_v128_or(hv,w); }
    if(wasm_i8x16_bitmask(hv)) hi=1; }
#endif
  #define LO7 0x7F7F7F7F7F7F7F7FULL
  #define Z(x) (~((((x)&LO7)+LO7)|(x)|LO7))
  for(;i+8<=len;i+=8){ u64 w; __builtin_memcpy(&w,in+i,8); H|=w;
    nl+=(u32)__builtin_popcountll(Z(w^0x0A0A0A0A0A0A0A0AULL)); co+=(u32)__builtin_popcountll(Z(w^0x3A3A3A3A3A3A3A3AULL)); cm+=(u32)__builtin_popcountll(Z(w^0x2C2C2C2C2C2C2C2CULL)); }
  #undef Z
  #undef LO7
  hi|=(H&0x8080808080808080ULL)!=0;
  for(;i<len;i++){ u8 c=in[i]; nl+=(c==10); co+=(c==':'); cm+=(c==','); hi|=(c>>7); }
  out[0]=nl; out[1]=co; out[2]=cm; out[3]=hi; return 0;
}
// hex id columns: a string column whose values all have the same even length of 16 or more and only 0-9a-f bytes becomes its packed bytes (two hex digits per byte) at out+hoff[k];
// hexL[k] gets that length, or 0 when the column is not hex. ASCII input only (the caller checks), so cell offsets are byte offsets. Returns the bytes used in out.
static u8 HX[256]; static u32 HXI, HCNT[MAXK], HWP[MAXK];
EXPORT("hexcols") u32 hexcols(const u8*in,u32 nc,const u8*ckey,const double*cval,const u32*clen,const u8*ktype,u32 nk,int*hexL,u32*hoff,u8*out){
  /* hexL[j]: 0 not a hex column, L (even, 16 or more) a column of lowercase hex text of L characters, 3600 a column of lowercase UUIDs (8-4-4-4-12), written as 16 bytes a value */
  u32 i,j,q,L,o=0,any=0;
  if(!HXI){ for(i=0;i<256;i++) HX[i]=16; for(i=0;i<10;i++) HX[48+i]=(u8)i; for(i=0;i<6;i++) HX[97+i]=(u8)(10+i); HXI=1; }
  for(j=0;j<nk;j++){ hexL[j]=ktype[j]==3?-1:0; HCNT[j]=0; }
  for(i=0;i<nc;i++){ j=ckey[i]; int h=hexL[j]; if(!h) continue; L=clen[i];
    if(h==-1){ if(L<16||(L&1)){ hexL[j]=0; continue; } if(L==36&&in[(u32)cval[i]+8]==45) hexL[j]=3600; else hexL[j]=(int)L; }
    else if(h==3600){ if(L!=36){ hexL[j]=0; continue; } }
    else if((u32)h!=L){ hexL[j]=0; continue; }
    HCNT[j]++; }
  for(j=0;j<nk;j++){ hoff[j]=HWP[j]=o; if(hexL[j]>0){ o+=HCNT[j]*(hexL[j]==3600?16u:((u32)hexL[j]>>1)); any=1; } }
  if(!any) return 0;
  for(i=0;i<nc;i++){ j=ckey[i]; if(hexL[j]<=0) continue; const u8*s=in+(u32)cval[i]; u8*d=out+HWP[j]; u32 bad=0; L=clen[i];
    if(hexL[j]==3600){
      if((s[8]^45)|(s[13]^45)|(s[18]^45)|(s[23]^45)) bad=16;
      for(q=0;q<36;q+=2){ if(q==8||q==13||q==18||q==23) q++; u32 a=HX[s[q]],b=HX[s[q+1]]; bad|=a|b; *d++=(u8)((a<<4)|b); }
      HWP[j]+=16; if(bad&16) hexL[j]=0; continue; }
    for(q=0;q<L;q+=2){ u32 a=HX[s[q]],b=HX[s[q+1]]; bad|=a|b; *d++=(u8)((a<<4)|b); }
    HWP[j]+=L>>1; if(bad&16) hexL[j]=0; }
  return o;
}
// string column straight from the bytes (ASCII input, not hex): first-seen dictionary over cells of key k, as encodeColumn builds it. Returns 0 when encodeColumn must see the strings
// (more than n/2 distinct values, where log templates may apply; every value 36 long, a possible UUID column; only digits and dots, a possible IPv4 column). Otherwise returns the
// distinct count D and writes res[0] = bytes at out: every value joined by 0 bytes when D*4 > n or D >= 65536 (encodeColumn's 's'), else the labels joined by 0 bytes, codes[] per cell.
// per-key cell lists: ix gets every cell index grouped by key (in row order within a key), ixo[k] where key k's run starts; count[k] from gather
EXPORT("keyix") void keyix(u32 nc,const u8*ckey,u32 nk,const u32*count,u32*ix,u32*ixo){
  u32 i,j,o=0; for(j=0;j<nk;j++){ ixo[j]=o; GWP[j]=o; o+=count[j]; }
  for(i=0;i<nc;i++) ix[GWP[ckey[i]]++]=i;
}
static inline u32 rotl(u32 x,u32 r){ return (x<<r)|(x>>(32-r)); }
static inline u32 hbytes_slow(const u8*a,u32 L);
static inline u32 hbytes(const u8*a,u32 L){   /* 4 to 16 bytes: two overlapping loads and one multiply-mix, no loop */
  if(L>=8&&L<=16){ u64 x,y; __builtin_memcpy(&x,a,8); __builtin_memcpy(&y,a+L-8,8); x*=0x9E3779B97F4A7C15ULL; y=(y^(y>>29))*0xBF58476D1CE4E5B9ULL; x^=y^((u64)L<<56); x^=x>>32; x*=0x94D049BB133111EBULL; return (u32)(x>>32); }
  if(L<8&&L>=4){ u32 p,q; __builtin_memcpy(&p,a,4); __builtin_memcpy(&q,a+L-4,4); u64 x=((u64)p<<32|q)^((u64)L<<59); x*=0x9E3779B97F4A7C15ULL; x^=x>>32; x*=0x94D049BB133111EBULL; return (u32)(x>>32); }
  return hbytes_slow(a,L);
}
static inline u32 hbytes_slow(const u8*a,u32 L){   /* 4 bytes a step (murmur3 mix); only the table's spread depends on it, never the output */
  u32 h=L*0x9E3779B1u,q=0,w;
  for(;q+4<=L;q+=4){ __builtin_memcpy(&w,a+q,4); w*=0xcc9e2d51u; w=rotl(w,15); w*=0x1b873593u; h^=w; h=rotl(h,13)*5+0xe6546b64u; }
  w=0; for(;q<L;q++) w=(w<<8)|a[q]; w*=0xcc9e2d51u; w=rotl(w,15); w*=0x1b873593u; h^=w;
  h^=h>>16; h*=0x85ebca6bu; h^=h>>13; h*=0xc2b2ae35u; h^=h>>16; return h;
}
static inline u32 sameb(const u8*a,const u8*b,u32 L){ u32 q=0; u64 x,y; for(;q+8<=L;q+=8){ __builtin_memcpy(&x,a+q,8); __builtin_memcpy(&y,b+q,8); if(x!=y) return 0; } for(;q<L;q++) if(a[q]!=b[q]) return 0; return 1; }
static inline u32 digdot(const u8*a,u32 L){ u32 q; for(q=0;q<L;q++){ u8 c=a[q]; if(!((c>=48&&c<=57)||c==46)) return 0; } return 1; }
// first-seen dictionary of key k's n string values (cells ix[0..n)): codes, labels (cell of each distinct value's first use), and out = the distinct values (or, with D*4 > n, all values) joined by 0 bytes.
// ht: 4*T u32 (id+1, hash, offset, length: a probe compares inside the table, no second lookup). res: [0] out length, [1] every value only digits and dots, [2] more than n/2 distinct (out = all values joined), [3] every value 36 long
EXPORT("strdict") u32 strdict(const u8*in,const double*cval,const u32*clen,const u32*ix,u32 n,u32*ht,u32*codes,u32*lab,u8*out,u32*res){
  u32 T=16,i,D=0,m=0,all36=1,dd=1,L,o,h,s,c2;
  res[1]=0; res[2]=0; res[3]=0;
  while(T<n+2) T<<=1;
  for(i=0;i<4*T;i+=4) ht[i]=0;
  for(m=0;m<n;m++){ c2=ix[m]; s=(u32)cval[c2]; L=clen[c2]; const u8*a=in+s;
    if(L!=36) all36=0;
    if(dd&&!digdot(a,L)) dd=0;
    h=hbytes(a,L); u32 at=h&(T-1),e,id=0xFFFFFFFFu;
    while((e=ht[4*at])!=0){ if(ht[4*at+1]==h&&ht[4*at+3]==L&&sameb(a,in+ht[4*at+2],L)){ id=e-1; break; } at=(at+1)&(T-1); }
    if(id==0xFFFFFFFFu){ if(D*2>n){   /* more than n/2 distinct values: encodeColumn's dictionary loop stops here too; hand over every value joined by 0 bytes ('s'), and whether every value is 36 long (res[3]) or only digits and dots (res[1]) */
        o=0; all36=1; dd=1;
        for(i=0;i<n;i++){ c2=ix[i]; if(i) out[o++]=0; s=(u32)cval[c2]; L=clen[c2]; if(L!=36) all36=0; if(dd&&!digdot(in+s,L)) dd=0; __builtin_memcpy(out+o,in+s,L); o+=L; }
        res[0]=o; res[1]=dd; res[2]=1; res[3]=all36; return 0; }
      id=D++; lab[id]=c2; ht[4*at]=id+1; ht[4*at+1]=h; ht[4*at+2]=s; ht[4*at+3]=L; }
    codes[m]=id; }
  res[1]=dd; if(D*2>n||all36||dd) return 0;
  o=0;
  if(D*4>n||D>=65536){ for(i=0;i<n;i++){ c2=ix[i]; if(i) out[o++]=0; s=(u32)cval[c2]; L=clen[c2]; __builtin_memcpy(out+o,in+s,L); o+=L; } }
  else for(i=0;i<D;i++){ if(i) out[o++]=0; c2=lab[i]; s=(u32)cval[c2]; L=clen[c2]; __builtin_memcpy(out+o,in+s,L); o+=L; }
  res[0]=o; return D;
}
// key k's string values as one JSON array text: '[' then each value's literal, quotes and escapes as in the input, joined by ',' then ']' (ASCII input, where offsets are byte offsets). Returns its length.
EXPORT("rawjoin") u32 rawjoin(const u8*in,const double*cval,const u32*clen,const u32*ix,u32 n,u8*out){
  u32 i,o=1,q; out[0]='[';
  for(i=0;i<n;i++){ u32 c2=ix[i],s=(u32)cval[c2]-1,L=clen[c2]+2; if(i) out[o++]=','; for(q=0;q<L;q++) out[o+q]=in[s+q]; o+=L; }
  out[o++]=']'; return o;
}
// per-key cell counts and list item totals, and every number column gathered into its own run of doubles at out+offs[k] (scaled to the column's fraction digits as the writer
// stores them). Returns 1 when a scaled value is 2^50 or more in size, which the fast path does not write.
static const u32 FDT[10]={0,2,2,3,4,5,6,7,8,9};
EXPORT("gather") u32 gather(u32 nc,const u8*ckey,const double*cval,const u8*cfd,const u8*ktype,const u8*kfd,u32 nk,const u32*llen,u32*count,u32*tot,u32*offs,double*out){
  u32 i,j,o=0;
  for(j=0;j<nk;j++){ count[j]=0; tot[j]=0; }
  for(i=0;i<nc;i++){ j=ckey[i]; count[j]++; if(ktype[j]==2) tot[j]+=llen[(u32)cval[i]]; }
  for(j=0;j<nk;j++){ offs[j]=GWP[j]=o; if(ktype[j]==1) o+=count[j]; }
  for(i=0;i<nc;i++){ j=ckey[i]; if(ktype[j]!=1) continue; double v=cval[i]*P10[FDT[kfd[j]]-cfd[i]]; if(!(v<1125899906842624.0&&v>-1125899906842624.0)) return 1; out[GWP[j]++]=v; }
  return 0;
}
// IPv4 column (encodeColumn's 'I'): every value of key k is four parts 0 or 1-9 then up to two digits, each under 256, joined by dots; writes 4 bytes per value. 0 when some value is not.
EXPORT("ipcol") u32 ipcol(const u8*in,const double*cval,const u32*clen,const u32*ix,u32 n,u8*out){
  u32 i,o=0;
  for(i=0;i<n;i++){ u32 c2=ix[i]; const u8*a=in+(u32)cval[c2]; u32 L=clen[c2],p=0,g;
    for(g=0;g<4;g++){ if(g){ if(p>=L||a[p]!='.') return 0; p++; }
      if(p>=L||a[p]<'0'||a[p]>'9') return 0;
      u32 v=a[p]-'0',nd=1; p++;
      if(v) while(p<L&&a[p]>='0'&&a[p]<='9'&&nd<3){ v=v*10+(a[p]-'0'); nd++; p++; }
      if(p<L&&a[p]>='0'&&a[p]<='9') return 0;   // a leading 0 followed by a digit, or a fourth digit
      if(v>255) return 0; out[o++]=(u8)v; }
    if(p!=L) return 0; }
  return 1;
}
// B13: a mixed-kind key that holds numbers and nulls (a nullable number column; after its first null every cell is a literal): the n cells of one key (ix lists them) turned into the non-null numbers as whole numbers over a common power of ten (mant, scaled by 10^st[0]) and a bit plane of the nulls (set bit = null, LSB first, placed after mant and the fraction-digit scratch). Returns the count of numbers, or 0xFFFFFFFF when a cell is anything else (text, exponent, -0, more than 15 digits, more than 9 fraction digits): the caller then takes the general path.
static const double P10D[10]={1.0,10.0,100.0,1e3,1e4,1e5,1e6,1e7,1e8,1e9};
EXPORT("litnum") u32 litnum(const u8*in,const double*cval,const u32*clen,const u8*cfd,const u32*ix,u32 n,double*mant,u32*st){
  u8*fd=(u8*)(mant+n); u8*pl=fd+n; u32 i,m=0,D=0,nb=(n+7)>>3;
  for(i=0;i<nb;i++) pl[i]=0;
  for(i=0;i<n;i++){
    u32 c2=ix[i]; double v; u32 f;
    if(cfd[c2]!=255){ if(clen[c2]||cfd[c2]>9) return 0xFFFFFFFFu; v=cval[c2]; f=cfd[c2]; }
    else {
      u32 s=(u32)cval[c2],L=clen[c2],k=0,nd=0,fr=0; const u8*q=in+s; int neg=0,dot=0; unsigned long long acc=0;
      if(L==4&&q[0]=='n'&&q[1]=='u'&&q[2]=='l'&&q[3]=='l'){ pl[i>>3]|=(u8)(1u<<(i&7)); continue; }
      if(k<L&&q[k]=='-'){ neg=1; k++; }
      for(;k<L;k++){ u8 ch=q[k]; if(ch>='0'&&ch<='9'){ acc=acc*10+(ch-'0'); nd++; if(dot) fr++; if(nd>15) return 0xFFFFFFFFu; } else if(ch=='.'&&!dot&&nd) dot=1; else return 0xFFFFFFFFu; }
      if(!nd||fr>9||(neg&&!acc)||(dot&&!fr)) return 0xFFFFFFFFu;
      v=neg?-(double)acc:(double)acc; f=fr;
    }
    mant[m]=v; fd[m]=(u8)f; if(f>D) D=f; m++;
  }
  for(i=0;i<m;i++){ double w=mant[i]*P10D[D-fd[i]]; if(w>2251799813685247.0||w<-2251799813685247.0) return 0xFFFFFFFFu; mant[i]=w; }
  st[0]=D; return m;
}
// B3b research: key k's literal cells (cfd 255, the suffix of a mixed-kind key) as one JSON array text: '[' then each literal joined by ',' then ']'. Returns its length.
EXPORT("litjoin") u32 litjoin(const u8*in,const double*cval,const u32*clen,const u8*cfd,const u32*ix,u32 n,u8*out){
  u32 i,o=1,f=0; out[0]='[';
  for(i=0;i<n;i++){ u32 c2=ix[i]; if(cfd[c2]!=255) continue; u32 s=(u32)cval[c2],L=clen[c2]; if(f) out[o++]=','; f=1; __builtin_memcpy(out+o,in+s,L); o+=L; }
  out[o++]=']'; return o;
}
// B25 (research): one number column's candidate frames in one call. b: n scaled whole numbers (|x| < 2^50, no -0) as doubles, as numGeneral / numCands hold them.
// res (doubles): [0] monotone (b[0] >= 0 and never falling), [1] min, [2] max, [3] bytes of the first form, [4] bytes of the delta form (0: not written), [5] bit width (0: no bit-packed form), [6] varint byte sum of the first form, [7] of the delta form.
// One pass writes all varint forms at once into fixed regions of out (n*8+8 bytes each): zigzag of each value, zigzag of the differences, and while the column stays monotone b[0] then the plain differences; a second pass bit-packs the offsets from the min (range under 2^24). res[8], res[9], res[10]: where the first form, the delta form and the bit-packed bytes start in out.
// mode 0: the general writer's rule (a form is written only when its varints are not more than 5% longer than the other's); mode 1: both forms whenever the column is not monotone and has 2+ values (the fast writer's rule for 0 to 2 fraction digits).
static inline u32 vlen64(u64 u){ return (u32)(70-__builtin_clzll(u|1))/7; }   /* bytes of u as a varint (u < 2^56) */
static inline u8* putv(u8*o,u64 u){   /* one varint as one 8-byte store (the caller keeps 8 spare bytes after the output) */
  if(u<128){ *o=(u8)u; return o+1; }
  u32 k=vlen64(u); u64 w=(u&0x7FULL)|((u<<1)&0x7F00ULL)|((u<<2)&0x7F0000ULL)|((u<<3)&0x7F000000ULL)|((u<<4)&0x7F00000000ULL)|((u<<5)&0x7F0000000000ULL)|((u<<6)&0x7F000000000000ULL)|((u<<7)&0x7F00000000000000ULL);
  w|=0x8080808080808080ULL&((1ULL<<(8*(k-1)))-1); __builtin_memcpy(o,&w,8); return o+k; }
static inline u64 zz64(i64 x){ return ((u64)x<<1)^(u64)(x>>63); }
EXPORT("numcol") u32 numcol(const double*b,u32 n,u8*out,double*res,u32 mode){
  u32 i; i64 v,pv,mn,mx; u64 la=0,lz=0,lb=0; int mono;
  if(!n){ res[0]=0; res[1]=1.0/0.0; res[2]=-1.0/0.0; res[3]=-1; res[4]=-1; res[5]=0; res[6]=0; res[7]=0; res[8]=0; res[9]=0; res[10]=0; return 0; }
  u8*Z=out, *D=out+(u64)n*8+8, *M=out+(u64)n*16+16, *z=Z, *d=D, *m=M;
  pv=(i64)b[0]; mono=pv>=0; mn=mx=pv; z=putv(z,zz64(pv)); d=putv(d,zz64(pv)); if(mono) m=putv(m,(u64)pv);
  for(i=1;i<n;i++){ v=(i64)b[i]; i64 q=v-pv; mn=v<mn?v:mn; mx=v>mx?v:mx; z=putv(z,zz64(v)); d=putv(d,zz64(q)); if(mono){ if(q<0) mono=0; else m=putv(m,(u64)q); } pv=v; }
  lz=(u64)(z-Z); lb=(u64)(d-D); la=(u64)(m-M);
  double sa=(double)(mono?la:lz), sb=(double)lb; int hasDz=!mono&&n>1, wa, wb;
  if(mode==1){ wa=1; wb=hasDz; } else { wa=!hasDz||sa<=sb*1.05; wb=hasDz&&sb<=sa*1.05; }
  u8*o=M+(u64)n*8+8; u32 w=0, bo=0;
  if(mx-mn<16777216){ u32 r=(u32)(mx-mn); w=r?32-(u32)__builtin_clz(r):1; u8*o0=o;
    u64 acc=0; u32 bits=0; for(i=0;i<n;i++){ acc|=(u64)(u32)((i64)b[i]-mn)<<bits; bits+=w; if(bits>=32){ u32 lo=(u32)acc; __builtin_memcpy(o,&lo,4); o+=4; acc>>=32; bits-=32; } }
    while(bits>0){ *o++=(u8)acc; acc>>=8; bits=bits>8?bits-8:0; } o=o0+(((u64)n*w+7)>>3); }
  res[0]=mono; res[1]=(double)mn; res[2]=(double)mx; res[3]=wa?(double)(mono?la:lz):-1.0; res[4]=wb?(double)lb:-1.0; res[5]=w; res[6]=sa; res[7]=sb;
  res[8]=(double)((mono?M:Z)-out); res[9]=(double)(D-out); res[10]=(double)(M+(u64)n*8+8-out);
  return (u32)(o-out);
}
// B25b: b21Flags in one pass: res[0] 1 when some value is -0, res[1] 1 when every value is a whole number under 2^50 in size, res[2] 1 when some value is NaN or infinite
EXPORT("numflags") void numflags(const double*a,u32 n,double*res){
  u32 i,nz=0,ai=1,nf=0; for(i=0;i<n;i++){ double x=a[i]; ai&=(x==__builtin_trunc(x))&(x<1125899906842624.0)&(x>-1125899906842624.0); nz|=(x==0)&(__builtin_signbit(x)!=0); nf|=!(x-x==0); } res[0]=nz; res[1]=ai; res[2]=nf; }
// scaleints: scaledInts in one pass. b[i] = round(a[i] * sc) (JavaScript Math.round: ties toward +infinity) for every i; returns 1 when each |b[i]| < 2^50 and b[i] / sc == a[i] exactly (what decimalScale's JavaScript check tests), 0 at the first value that fails (b is then incomplete)
static inline double jsround(double y){ double r=__builtin_floor(y); return (y-r>=0.5)?r+1.0:r; }
EXPORT("scaleints") u32 scaleints(const double*a,u32 n,double sc,double*b){
  u32 i; for(i=0;i<n;i++){ double x=a[i], r=jsround(x*sc); if(!((r<1125899906842624.0)&(r>-1125899906842624.0)&(r/sc==x))) return 0; b[i]=r; } return 1;
}
// B59 (B53 kernel): a text column's n values joined by 0 bytes in in[0..len) (packRows writes them there): the first-seen dictionary codes, and out = the distinct values joined by 0 bytes (only when it is a dictionary: D*4 <= n and D < 65536).
// chk 1: first checks the input holds exactly n-1 zero bytes (some value held a 0 char: returns 0xFFFFFFFF). cap: like encodeColumn's loop, stops at a new value once D*cap > n and returns D with res[1] = 1. ht: 4*T u32, T a power of two >= 2*(n/cap+2).
EXPORT("sdz") u32 sdz(const u8*in,u32 len,u32 n,u32 cap,u32 chk,u32 T,u32*ht,u32*codes,u8*out,u32*res){
  u32 i,D=0,m,s=0,e,L,h,at,id,o;
  res[0]=0; res[1]=0;
  if(chk){ u32 z=0,q=0; for(;q+8<=len;q+=8){ u64 x; __builtin_memcpy(&x,in+q,8); u64 t=((x&0x7F7F7F7F7F7F7F7FULL)+0x7F7F7F7F7F7F7F7FULL)|x|0x7F7F7F7F7F7F7F7FULL; t=~t; z+=__builtin_popcountll(t); } for(;q<len;q++) z+=in[q]==0; if(z!=(n?n-1:0)) return 0xFFFFFFFFu; }
  for(i=0;i<4*T;i+=4) ht[i]=0;
  for(m=0;m<n;m++){ e=s; while(e<len&&in[e]) e++; L=e-s; const u8*a=in+s;
    h=hbytes(a,L); at=h&(T-1); id=0xFFFFFFFFu; u32 x;
    while((x=ht[4*at])!=0){ if(ht[4*at+1]==h&&ht[4*at+3]==L&&sameb(a,in+ht[4*at+2],L)){ id=x-1; break; } at=(at+1)&(T-1); }
    if(id==0xFFFFFFFFu){ if(D*cap>n){ res[1]=1; return D; } id=D++; ht[4*at]=id+1; ht[4*at+1]=h; ht[4*at+2]=s; ht[4*at+3]=L; }
    codes[m]=id; s=e+1; }
  if(D*4<=n&&D<65536){ o=0; for(i=0;i<4*T;i+=4) if(ht[i]) codes[n+ht[i]-1]=i; for(i=0;i<D;i++){ u32 k=codes[n+i]; if(i) out[o++]=0; __builtin_memcpy(out+o,in+ht[k+2],ht[k+3]); o+=ht[k+3]; } res[0]=o; }
  return D;
}
// B57: the template layout (encodeColumn's 'L', templateFrames in flat.js) built from a text column's bytes (n values joined by 0 bytes, UTF-8): the same five frames.
// Slots follow slotScan: a run of 8 or more hex digits [0-9a-f] holding a letter, else -?[0-9]+; every slot becomes byte 1 in its template. Templates are numbered first seen;
// slot groups run in (template, slot) order. A group whose every value is canonical (0 or -?[1-9] then up to 14 digits) is stored as varints of the zigzag differences, else as text joined by '\n'.
// Memory (caller lays out): tl (len + n), ids (4n), sg/ss/sl (4 * S each, S = slot capacity), gb (4*65537), gc (4*G cap), ht (16*T), out frames: txt (len + n), num (10 * S), kinds (G cap).
// res: [0] tl length, [1] groups, [2] txt length, [3] num length, [4] templates, [5] slots. Returns 0, or 1 when the layout cannot be built (byte 1 in a value, over 65,536 templates, a template with 4,096 slots or more, or over the slot or group capacity).
static const u8 TCL[256]={[48 ... 57]=1,[97 ... 102]=2,[45]=3,[1]=4,[0]=5};   /* B58b: byte kinds for tplbuild: digit, hex letter, minus, byte 1, 0 */
EXPORT("tplbuild") u32 tplbuild(const u8*in,u32 len,u32 n,u8*tl,u32*ids,u32*sg,u32*ss,u32*sl,u32 S,u32*gb,u32*gc,u32 GC,u32*ht,u32 T,u8*txt,u8*num,u8*kinds,u32*ord,u32*res){
  u32 i,p=0,tlE=0,D=0,G=0,ns=0,k;
  for(i=0;i<4*T;i+=4) ht[i]=0;
  ((u8*)in)[len]=0;   /* B58b: a 0 byte after the last value ends it like the others (the caller lays out len + 8 bytes) */
  for(u32 v=0;v<n;v++){
    u32 s=p,e,q=s,last=s,m=0,s0=ns,j,hx;
    u32 tp=tlE+(D?1:0),o=tp;
    for(;;){ u32 k;
      while((k=TCL[in[q]])==0) q++;   /* B58b: one table lookup a byte; the 0 byte that ends the value is found in the same pass */
      if(k==5) break;
      if(k==4) return 1;
      if(k==3){ if(TCL[in[q+1]]==1){ j=q+2; while(TCL[in[j]]==1) j++; goto slot; } q++; continue; }
      j=q; hx=0; for(;;){ u32 kk=TCL[in[j]]; if(kk==2) hx=1; else if(kk!=1) break; j++; }
      if(!hx||j-q>=8) goto slot;
      while(q<j&&TCL[in[q]]==2) q++;   /* a short run holding a letter: its first digit starts a number slot (as stepping one byte at a time finds) */
      if(q==j) continue;
      j=q+1; while(TCL[in[j]]==1) j++;
    slot:
      __builtin_memcpy(tl+o,in+last,q-last); o+=q-last; tl[o++]=1; if(ns>=S) return 1; ss[ns]=q; sl[ns]=j-q; sg[ns]=m++; ns++; q=last=j;
    }
    e=q; if(e==len&&v+1<n) return 1; p=e+1;
    __builtin_memcpy(tl+o,in+last,e-last); o+=e-last;
    u32 L=o-tp,h=hbytes(tl+tp,L);
    u32 at=h&(T-1),x,id=0xFFFFFFFFu;
    while((x=ht[4*at])!=0){ if(ht[4*at+1]==h&&ht[4*at+3]==L&&sameb(tl+tp,tl+ht[4*at+2],L)){ id=x-1; break; } at=(at+1)&(T-1); }
    if(id==0xFFFFFFFFu){ if(D>65535) return 1; if(m>4096) return 1; id=D++; if(id) tl[tlE]=0; ht[4*at]=id+1; ht[4*at+1]=h; ht[4*at+2]=tp; ht[4*at+3]=L; tlE=tp+L; gb[id]=G; if(G+m>GC) return 1; for(k=0;k<m;k++) gc[G+k]=0; G+=m; }
    ids[v]=id;
    for(k=s0;k<ns;k++){ sg[k]=gb[id]+sg[k]; gc[sg[k]]++; }
  }
  if(p<len||(n&&p!=len+1)) { if(!(n==0&&len==0)) return 1; }
  // counting sort of the slots by group, stable (value order inside a group)
  u32 acc=0; for(k=0;k<G;k++){ u32 c=gc[k]; gc[k]=acc; acc+=c; }
  for(k=0;k<ns;k++) ord[gc[sg[k]]++]=k;
  u32 tO=0,nO=0,a=0,tg=0;
  for(u32 g=0;g<G;g++){ u32 b=gc[g],canon=1;
    for(k=a;k<b&&canon;k++){ u32 z=ord[k]; const u8*t=in+ss[z]; u32 L=sl[z],q=0; if(L==1&&t[0]=='0') continue; if(t[0]=='-') q=1; if(q>=L||t[q]<'1'||t[q]>'9'||L-q>15) { canon=0; break; } for(q++;q<L;q++) if(t[q]<'0'||t[q]>'9'){ canon=0; break; } }
    kinds[g]=(u8)canon;
    if(canon){ i64 prev=0; for(k=a;k<b;k++){ u32 z=ord[k]; const u8*t=in+ss[z]; u32 L=sl[z],q=0; i64 xv=0; int neg=0; if(t[0]=='-'){ neg=1; q=1; } for(;q<L;q++) xv=xv*10+(t[q]-'0'); if(neg) xv=-xv; i64 d=xv-prev; prev=xv; u64 u=d>=0?(u64)d*2:(u64)(-d)*2-1; while(u>=128){ num[nO++]=(u8)(u&127)|128; u>>=7; } num[nO++]=(u8)u; } }
    else { if(tg) txt[tO++]=0; tg++; for(k=a;k<b;k++){ u32 z=ord[k]; if(k>a) txt[tO++]='\n'; for(u32 q=0;q<sl[z];q++) txt[tO++]=in[ss[z]+q]; } }
    a=b; }
  res[0]=tlE; res[1]=G; res[2]=tO; res[3]=nO; res[4]=D; res[5]=ns; return 0;
}

// Since 0.14.9: the cut of a text column that text: 'bytes' returns. Finds the first cap zero bytes of B[0..len): end[c] = position, start[c+1] = position + 1 (the caller sets start[0] = 0 and the last end). Returns how many it found (fewer than cap: the block is damaged).
EXPORT("nulpos") u32 nulpos(const u8*B,u32 len,int*st,int*en,u32 cap){
  u32 c=0,i=0; if(!cap) return 0;
#ifdef __wasm_simd128__
  v128_t z=wasm_i8x16_splat(0);
  for(;i+16<=len;i+=16){ u32 m=wasm_i8x16_bitmask(wasm_i8x16_eq(wasm_v128_load(B+i),z));
    while(m){ u32 q=i+(u32)__builtin_ctz(m); en[c]=(int)q; st[c+1]=(int)q+1; m&=m-1; if(++c==cap) return c; } }
#endif
  for(;i<len;i++) if(B[i]==0){ en[c]=(int)i; st[c+1]=(int)i+1; if(++c==cap) return c; }
  return c;
}
// byteCol kernel (from the text-columns research, folded in here): the byte-by-byte passes of byteCol for a text column given as bytes and value offsets.
static u32 bc_tot;
EXPORT("bctot") u32 bctot(void){ return bc_tot; }
// flags: 1 = an offset is outside the bytes, 2 = a NUL byte, 4 = a byte above 127. Stops at the first NUL or bad offset (same as the JavaScript loop).
#ifdef __wasm_simd128__
// Since 0.14.8: one value is checked with 16-byte loads (a value under 16 bytes with one load and a mask, a longer one in 16-byte steps and one overlapping load at its end), not byte by byte. Returns 1 when the value has no NUL (a byte over 127 sets 128 in *hi,
// any other byte 1), 0 when it has one: the caller then runs the byte loop, which reports it as before. Reads at most 15 bytes past the value: B has 16 spare bytes after it (bkPrep).
static inline int scanv(const u8*B,int s,int e,u32*hi){
  int len=e-s;
  if(len<=0)return 1;
  v128_t z=wasm_i8x16_splat(0);
  if(len<16){v128_t v=wasm_v128_load(B+s);u32 m=(1u<<len)-1;
    if(wasm_i8x16_bitmask(wasm_i8x16_eq(v,z))&m)return 0;
    *hi|=(wasm_i8x16_bitmask(v)&m)?128u:1u;return 1;}
  v128_t hv=z;int k=s;
  for(;k+16<=e;k+=16){v128_t v=wasm_v128_load(B+k);if(wasm_v128_any_true(wasm_i8x16_eq(v,z)))return 0;hv=wasm_v128_or(hv,v);}
  if(k<e){v128_t v=wasm_v128_load(B+e-16);if(wasm_v128_any_true(wasm_i8x16_eq(v,z)))return 0;hv=wasm_v128_or(hv,v);}
  *hi|=wasm_i8x16_bitmask(hv)?128u:1u;return 1;
}
#endif
static u32 bcscan_slow(const u8*B,u32 blen,const int*S,const int*E,u32 n){
  u32 hi=0,t=0;
  for(u32 i=0;i<n;i++){
    int s=S[i],e=E[i];
    if(!(s>=0&&e>=s&&(u32)e<=blen)){bc_tot=t;return 1;}
#ifdef __wasm_simd128__
    if(scanv(B,s,e,&hi)){t+=(u32)(e-s);continue;}
#endif
    for(int k=s;k<e;k++){u8 c=B[k];if(!c){bc_tot=t;return 2|(hi?4:0);}hi|=c;}
    t+=(u32)(e-s);
  }
  bc_tot=t;return hi&128?4:0;
}
// Since 0.14.7: when the values sit one after the other (each starts where the last ended, the usual CSV column) and every offset is inside the bytes, the whole range is checked 16 bytes at a time (SIMD build) for a NUL and a byte above 127; anything else, or a NUL, takes the value-by-value loop above, so the result is the same.
EXPORT("bcscan") u32 bcscan(const u8*B,u32 blen,const int*S,const int*E,u32 n){
#ifdef __wasm_simd128__
  if(n){
    int a=S[0],b=E[n-1];
    if(a>=0&&b>=a&&(u32)b<=blen){
      u32 i=0;int pe=a;
      for(;i<n;i++){int s=S[i],e=E[i];if(s!=pe||e<s)break;pe=e;}
      if(i==n&&pe==b){
        int k=a;v128_t hv=wasm_i8x16_splat(0),z=wasm_i8x16_splat(0);int nul=0;
        for(;k+16<=b;k+=16){v128_t v=wasm_v128_load(B+k);if(wasm_v128_any_true(wasm_i8x16_eq(v,z))){nul=1;break;}hv=wasm_v128_or(hv,v);}
        u32 hi=wasm_i8x16_bitmask(hv)?128u:0u;
        if(!nul)for(;k<b;k++){u8 c=B[k];if(!c){nul=1;break;}hi|=c;}
        if(!nul){bc_tot=(u32)(b-a);return hi&128?4:0;}
      }
    }
  }
#endif
  return bcscan_slow(B,blen,S,E,n);
}
// Since 0.14.7: values of 16 bytes or less are hashed from at most two 8-byte loads (the first 8 and the last 8; a shorter value is cut with a mask), not byte by byte. The bytes are read from the padded copy (16 spare bytes after it). The hash only picks table slots: labels are numbered in first-seen order, so codes and files are the same.
static inline u32 bc_hs(const u8*p,u32 l){
  const u64 M=0xd6e8feb86659fd93ull;u64 a,b;
  if(l>=8){a=*(const u64*)p;b=*(const u64*)(p+l-8);}else{a=*(const u64*)p&((1ull<<(8*l))-1);b=0;}
  u64 h=(a^((u64)l*0x9e3779b97f4a7c15ull))*M;h^=h>>32;h=(h^b)*M;h^=h>>32;return (u32)h;
}
static inline u32 bc_hash(const u8*p,u32 l){if(l<=16)return bc_hs(p,l);u32 h=2166136261u;for(u32 k=0;k<l;k++){h^=p[k];h*=16777619u;}return h^l;}
static inline int bc_eq(const u8*a,const u8*b,u32 l){
  if(l<=16){if(l>=8)return *(const u64*)a==*(const u64*)b&&*(const u64*)(a+l-8)==*(const u64*)(b+l-8);return ((*(const u64*)a^*(const u64*)b)&((1ull<<(8*l))-1))==0;}
  u32 k=0;for(;k+8<=l;k+=8){if(*(const u64*)(a+k)!=*(const u64*)(b+k))return 0;}for(;k<l;k++)if(a[k]!=b[k])return 0;return 1;}
// Distinct values in first-seen order. tab: HB u32 slots (label + 1, 0 empty), HB a power of two; lab: the row of each label's first value; codes: the label of each row; lh: each label's hash.
// Returns the label count, or 0xFFFFFFFF where the string path's rule stops (a new value arrives when labels * 4 > n).
EXPORT("bcdict") u32 bcdict(const u8*B,const int*S,const int*E,u32 n,int*codes,int*lab,u32*lh,u32*tab,u32 HB){
  u32 nl=0,mask=HB-1;
  for(u32 i=0;i<n;i++){
    const u8*p=B+S[i];u32 l=(u32)(E[i]-S[i]),h=bc_hash(p,l),q=h&mask,c;
    for(;;){c=tab[q];if(!c)break;u32 j=c-1;if(lh[j]==h){int ls=S[lab[j]];if((u32)(E[lab[j]]-ls)==l&&bc_eq(B+ls,p,l))break;}q=(q+1)&mask;}
    if(!c){if(nl*4>n)return 0xFFFFFFFFu;lab[nl]=(int)i;lh[nl]=h;tab[q]=nl+1;c=nl+1;nl++;}
    codes[i]=(int)(c-1);
  }
  return nl;
}
// Join values with 0 bytes between them: idx = a row list (cnt entries), or 0 for rows 0..cnt-1. Returns the length written to out.
EXPORT("bcjoin") u32 bcjoin(const u8*B,const int*S,const int*E,const int*idx,u32 cnt,u8*out){
  u32 p=0;
  for(u32 j=0;j<cnt;j++){u32 r=idx?(u32)idx[j]:j;if(j)out[p++]=0;u32 x=(u32)S[r],y=(u32)E[r];while(x<y)out[p++]=B[x++];}
  return p;
}

// Wide text columns (average value 24 bytes or more; flat.js picks these by the column's average length, short columns keep the three byte-loop functions above, which are faster on short values).
// The same results as bcscan, bcdict and bcjoin: bcscanw reads 16 bytes at a time (SIMD build), bcdictw hashes 8 bytes per step (the hash only picks table slots, labels are numbered in first-seen order, so codes and bytes cannot change), bcjoinw copies values of 16 bytes or more with memory.copy.
// The 8-bytes-per-step hash follows DuckDB's HashBytes (MIT, https://github.com/duckdb/duckdb/blob/main/src/common/types/hash.cpp, multiplier from martinus/robin-hood-hashing, MIT).
EXPORT("bcscanw") u32 bcscanw(const u8*B,u32 blen,const int*S,const int*E,u32 n){
  u32 hi=0,t=0;
  for(u32 i=0;i<n;i++){
    int s=S[i],e=E[i];
    if(!(s>=0&&e>=s&&(u32)e<=blen)){bc_tot=t;return 1;}
    int k=s;
#ifdef __wasm_simd128__
    if(scanv(B,s,e,&hi)){t+=(u32)(e-s);continue;}
#endif
    for(;k<e;k++){u8 c=B[k];if(!c){bc_tot=t;return 2|(hi?4:0);}hi|=c;}
    t+=(u32)(e-s);
  }
  bc_tot=t;return hi&128?4:0;
}
static inline u32 bc_hashw(const u8*p,u32 l){
  if(l<=16)return bc_hs(p,l);
  const u64 M=0xd6e8feb86659fd93ull;u64 h=0xe17a1465ull^((u64)l*M);u32 k=0;
  for(;k+8<=l;k+=8){h^=*(const u64*)(p+k);h*=M;h^=h>>32;}
  h^=*(const u64*)(p+l-8);h*=M;h^=h>>32;return (u32)h^l;
}
EXPORT("bcdictw") u32 bcdictw(const u8*B,const int*S,const int*E,u32 n,int*codes,int*lab,u32*lh,u32*tab,u32 HB){
  u32 nl=0,mask=HB-1;
  for(u32 i=0;i<n;i++){
    const u8*p=B+S[i];u32 l=(u32)(E[i]-S[i]),h=bc_hashw(p,l),q=h&mask,c;
    for(;;){c=tab[q];if(!c)break;u32 j=c-1;if(lh[j]==h){int ls=S[lab[j]];if((u32)(E[lab[j]]-ls)==l&&bc_eq(B+ls,p,l))break;}q=(q+1)&mask;}
    if(!c){if(nl*4>n)return 0xFFFFFFFFu;lab[nl]=(int)i;lh[nl]=h;tab[q]=nl+1;c=nl+1;nl++;}
    codes[i]=(int)(c-1);
  }
  return nl;
}
EXPORT("bcjoinw") u32 bcjoinw(const u8*B,const int*S,const int*E,const int*idx,u32 cnt,u8*out){
  u32 p=0;
  for(u32 j=0;j<cnt;j++){u32 r=idx?(u32)idx[j]:j;if(j)out[p++]=0;u32 x=(u32)S[r],y=(u32)E[r];
#ifdef __wasm_simd128__
    for(u32 k=0;k<y-x;k+=16)wasm_v128_store(out+p+k,wasm_v128_load(B+x+k));   // since 0.14.8: whole 16-byte pieces, up to 15 bytes past the value (the next value or the 16 spare bytes of out take them); reads stay in B's 16 spare bytes
    p+=y-x;
#else
    if(y-x>=16){__builtin_memcpy(out+p,B+x,y-x);p+=y-x;continue;}while(x<y)out[p++]=B[x++];
#endif
  }
  return p;
}
