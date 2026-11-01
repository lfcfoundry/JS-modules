// LFC-pack flat writer, fast path: scans NDJSON rows whose values are numbers (integers or decimals with a plain fraction), arrays of whole numbers, strings without escapes, true/false and null,
// straight from the text bytes. Anything else (nested objects, escapes in strings, exponents, blank lines, CR, duplicate keys, integer-like keys, __proto__) returns a bail code and the caller uses the JSON.parse path.
// No libc, no static buffers apart from two small tables; the caller lays every output array out in linear memory.
typedef unsigned char u8; typedef unsigned int u32; typedef unsigned long long u64; typedef long long i64;
#define EXPORT(n) __attribute__((export_name(n)))
#define MAXK 128
static u32 HT[512]; static u32 LASTROW[MAXK];
static u32 PRED[MAXK], KEXTRA[MAXK];   /* PRED[j]: the key that came j-th in the last row (rows mostly repeat their key order); KEXTRA: a key's UTF-8 bytes minus UTF-16 units */
static const double P10[19]={1,1e1,1e2,1e3,1e4,1e5,1e6,1e7,1e8,1e9,1e10,1e11,1e12,1e13,1e14,1e15,1e16,1e17,1e18};
// digits from in[p] on, 8 at a time: m = m*10^k + their value, *nd += k; returns the new p, or 0xFFFFFFFF when more than 15 digits in all
static const u64 P10U[9]={1,10,100,1000,10000,100000,1000000,10000000,100000000};
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
EXPORT("scan") u32 scan(const u8*in,u32 len,u32 nrows,u8*planes,u32 pb,u32*keyoff,u32*keylen,u8*ktype,u8*kmaxfd,u32*st,u8*ckey,double*cval,u8*cfd,u32*llen,u32*lval,u32*clen,u32 allowstr){
  u32 p=0,row=0,nk=0,nc=0,nl=0,nlv=0,extra=0;   // extra = bytes minus UTF-16 units so far, for the strings' offsets in the decoded text
  for(u32 i=0;i<512;i++) HT[i]=0;
  for(u32 i=0;i<MAXK;i++){ LASTROW[i]=0xFFFFFFFFu; PRED[i]=0xFFFFFFFFu; }
#define BAIL(c) do{ st[0]=nk; st[1]=nc; st[2]=nl; st[3]=nlv; st[4]=row; st[5]=p; return (c); }while(0)
#define WS while(p<len&&(in[p]==' '||in[p]=='\t')) p++
  while(p<len){
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
        if(ktype[id]==0) ktype[id]=1; else if(ktype[id]!=1) BAIL(8);
        u32 neg=0; if(c=='-'){ neg=1; p++; }
        if(p>=len||in[p]<'0'||in[p]>'9') BAIL(10);
        u64 m=0; u32 nd=0, fd=0;
        if(in[p]=='0'&&p+1<len&&in[p+1]>='0'&&in[p+1]<='9') BAIL(10);
        { u32 q=digits(in,p,len,&m,&nd); if(q==0xFFFFFFFFu) BAIL(10); p=q; }
        if(p<len&&in[p]=='.'){
          p++; if(p>=len||in[p]<'0'||in[p]>'9') BAIL(10);
          { u32 n0=nd, q=digits(in,p,len,&m,&nd); if(q==0xFFFFFFFFu) BAIL(10); fd+=nd-n0; p=q; }
          while(fd>0&&m%10==0){ m/=10; fd--; }   // 1.50 is 1.5 and 2.0 is the whole number 2, as JSON.parse sees them
        }
        if(p<len&&(in[p]=='e'||in[p]=='E')) BAIL(10);
        if(neg&&m==0) BAIL(11);   // -0
        if(fd>9) BAIL(12);   /* up to 9 fraction digits, as the JSON.parse path's decimal scale */
        if(fd>kmaxfd[id]) kmaxfd[id]=(u8)fd;
        ckey[nc]=(u8)id; cval[nc]=neg?-(double)m:(double)m; cfd[nc]=(u8)fd; clen[nc]=0; nc++;
      } else if(c=='"'){
        if(!allowstr) BAIL(16);
        if(ktype[id]==0) ktype[id]=3; else if(ktype[id]!=3) BAIL(8);
        u32 ss=++p, ex0=extra;
        while(p<len&&in[p]!='"'){ u8 ch=in[p]; if(ch<0x20||ch=='\\') BAIL(16); if(ch>=0xC0) extra+=(ch>=0xE0)?2:1; p++; }
        if(p>=len) BAIL(16);
        ckey[nc]=(u8)id; cval[nc]=(double)(ss-ex0); clen[nc]=(p-ss)-(extra-ex0); cfd[nc]=0; nc++; p++;
      } else if(c=='t'||c=='f'){
        if(ktype[id]==0||ktype[id]==5) ktype[id]=4; else if(ktype[id]!=4) BAIL(8);
        u32 isT=(c=='t');
        if(isT){ if(p+4>len||in[p+1]!='r'||in[p+2]!='u'||in[p+3]!='e') BAIL(17); p+=4; }
        else { if(p+5>len||in[p+1]!='a'||in[p+2]!='l'||in[p+3]!='s'||in[p+4]!='e') BAIL(17); p+=5; }
        ckey[nc]=(u8)id; cval[nc]=isT?1.0:0.0; cfd[nc]=0; nc++;
      } else if(c=='n'){
        if(ktype[id]==0) ktype[id]=5; else if(ktype[id]!=5&&ktype[id]!=4) BAIL(8);   // null mixes with true/false
        if(p+4>len||in[p+1]!='u'||in[p+2]!='l'||in[p+3]!='l') BAIL(17);
        p+=4; ckey[nc]=(u8)id; cval[nc]=0.0; cfd[nc]=2; clen[nc]=0; nc++;
      } else BAIL(13);
      planes[id*pb+(row>>3)]|=(u8)(1u<<(row&7));
      WS; if(p>=len) BAIL(3);
      if(in[p]==','){ p++; WS; continue; }
      if(in[p]=='}'){ p++; break; }
      BAIL(3);
    }
    WS;
    row++;
    if(p<len){ if(in[p]!='\n') BAIL(14); p++; }
  }
  if(row!=nrows) BAIL(15);
  st[0]=nk; st[1]=nc; st[2]=nl; st[3]=nlv; st[4]=row; st[5]=p;
  return 0;
}
EXPORT("count") u32 count(const u8*in,u32 len,u32*out){   // newlines, colons, commas: bounds for the output arrays; out[3] is 1 when some byte is 128 or more
  /* 8 bytes at a time: a byte equal to t becomes 0 in w^T, and Z() sets the top bit of exactly the zero bytes (no carries between bytes), so a popcount counts them */
  u32 nl=0,co=0,cm=0,hi=0,i=0; u64 H=0;
  #define LO7 0x7F7F7F7F7F7F7F7FULL
  #define Z(x) (~((((x)&LO7)+LO7)|(x)|LO7))
  for(;i+8<=len;i+=8){ u64 w; __builtin_memcpy(&w,in+i,8); H|=w;
    nl+=(u32)__builtin_popcountll(Z(w^0x0A0A0A0A0A0A0A0AULL)); co+=(u32)__builtin_popcountll(Z(w^0x3A3A3A3A3A3A3A3AULL)); cm+=(u32)__builtin_popcountll(Z(w^0x2C2C2C2C2C2C2C2CULL)); }
  #undef Z
  #undef LO7
  hi=(H&0x8080808080808080ULL)!=0;
  for(;i<len;i++){ u8 c=in[i]; nl+=(c==10); co+=(c==':'); cm+=(c==','); hi|=(c>>7); }
  out[0]=nl; out[1]=co; out[2]=cm; out[3]=hi; return 0;
}
// hex id columns: a string column whose values all have the same even length of 16 or more and only 0-9a-f bytes becomes its packed bytes (two hex digits per byte) at out+hoff[k];
// hexL[k] gets that length, or 0 when the column is not hex. ASCII input only (the caller checks), so cell offsets are byte offsets. Returns the bytes used in out.
static u8 HX[256]; static u32 HXI, HCNT[MAXK], HWP[MAXK];
EXPORT("hexcols") u32 hexcols(const u8*in,u32 nc,const u8*ckey,const double*cval,const u32*clen,const u8*ktype,u32 nk,int*hexL,u32*hoff,u8*out){
  u32 i,j,q,L,o=0,any=0;
  if(!HXI){ for(i=0;i<256;i++) HX[i]=16; for(i=0;i<10;i++) HX[48+i]=(u8)i; for(i=0;i<6;i++) HX[97+i]=(u8)(10+i); HXI=1; }
  for(j=0;j<nk;j++){ hexL[j]=ktype[j]==3?-1:0; HCNT[j]=0; }
  for(i=0;i<nc;i++){ j=ckey[i]; int h=hexL[j]; if(!h) continue; L=clen[i];
    if(h==-1){ if(L<16||(L&1)){ hexL[j]=0; continue; } hexL[j]=(int)L; } else if((u32)h!=L){ hexL[j]=0; continue; }
    HCNT[j]++; }
  for(j=0;j<nk;j++){ hoff[j]=HWP[j]=o; if(hexL[j]>0){ o+=HCNT[j]*((u32)hexL[j]>>1); any=1; } }
  if(!any) return 0;
  for(i=0;i<nc;i++){ j=ckey[i]; if(hexL[j]<=0) continue; const u8*s=in+(u32)cval[i]; u8*d=out+HWP[j]; u32 bad=0; L=clen[i];
    for(q=0;q<L;q+=2){ u32 a=HX[s[q]],b=HX[s[q+1]]; bad|=a|b; *d++=(u8)((a<<4)|b); }
    HWP[j]+=L>>1; if(bad&16) hexL[j]=0; }
  return o;
}
// string column straight from the bytes (ASCII input, not hex): first-seen dictionary over cells of key k, as encodeColumn builds it. Returns 0 when encodeColumn must see the strings
// (more than n/2 distinct values, where log templates may apply; every value 36 long, a possible UUID column; only digits and dots, a possible IPv4 column). Otherwise returns the
// distinct count D and writes res[0] = bytes at out: every value joined by 0 bytes when D*4 > n or D >= 65536 (encodeColumn's 's'), else the labels joined by 0 bytes, codes[] per cell.
EXPORT("strdict") u32 strdict(const u8*in,u32 nc,const u8*ckey,const double*cval,const u32*clen,u32 k,u32 n,u32*ht,u32*codes,u32*lab,u8*out,u32*res){
  u32 T=16,i,q,D=0,m=0,all36=1,dd=1,L,o,h,s;
  while(T<n+2) T<<=1;
  for(i=0;i<T;i++) ht[i]=0;
  for(i=0;i<nc;i++){ if(ckey[i]!=k) continue; s=(u32)cval[i]; L=clen[i]; const u8*a=in+s; h=2166136261u;
    if(L!=36) all36=0;
    for(q=0;q<L;q++){ u8 c=a[q]; h=(h^c)*16777619u; if(dd&&!((c>=48&&c<=57)||c==46)) dd=0; }
    h^=h>>15; u32 at=h&(T-1),e,id=0xFFFFFFFFu;
    while((e=ht[at])!=0){ u32 c2=lab[e-1],L2=clen[c2]; if(L2==L){ const u8*b=in+(u32)cval[c2]; for(q=0;q<L&&a[q]==b[q];q++){} if(q==L){ id=e-1; break; } } at=(at+1)&(T-1); }
    if(id==0xFFFFFFFFu){ if(D*2>n) return 0; id=D++; lab[id]=i; ht[at]=id+1; }
    codes[m++]=id; }
  if(D*2>n||all36||dd) return 0;
  o=0;
  if(D*4>n||D>=65536){ for(i=0;i<nc;i++){ if(ckey[i]!=k) continue; if(o) out[o++]=0; s=(u32)cval[i]; L=clen[i]; for(q=0;q<L;q++) out[o++]=in[s+q]; } }
  else for(i=0;i<D;i++){ if(i) out[o++]=0; u32 c2=lab[i]; s=(u32)cval[c2]; L=clen[c2]; for(q=0;q<L;q++) out[o++]=in[s+q]; }
  res[0]=o; return D;
}
