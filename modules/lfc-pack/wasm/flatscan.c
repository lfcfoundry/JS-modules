// LFC-pack flat writer, fast path: scans NDJSON rows whose values are non-negative-or-negative numbers (integers or decimals with a plain fraction) and arrays of whole numbers,
// straight from the text bytes. Anything else (strings, true/false/null, nested objects, escapes, exponents, blank lines, CR, duplicate keys, integer-like keys, __proto__) returns a bail code and the caller uses the JSON.parse path.
// No libc, no static buffers apart from two small tables; the caller lays every output array out in linear memory.
typedef unsigned char u8; typedef unsigned int u32; typedef unsigned long long u64; typedef long long i64;
#define EXPORT(n) __attribute__((export_name(n)))
#define MAXK 128
static u32 HT[512]; static u32 LASTROW[MAXK];
static const double P10[19]={1,1e1,1e2,1e3,1e4,1e5,1e6,1e7,1e8,1e9,1e10,1e11,1e12,1e13,1e14,1e15,1e16,1e17,1e18};
// st: [0]=keys [1]=cells [2]=lists [3]=list values [4]=rows [5]=error position
// key outputs: keyoff/keylen (into the input), ktype (1 number, 2 list), kmaxfd (largest fraction digit count of the column)
// cell outputs, in row-major order: ckey (key id), cval (number: signed mantissa as double; list: index into llen), cfd (fraction digits, numbers only)
// list outputs: llen (length of each list), lval (values, pooled in the same order)
EXPORT("scan") u32 scan(const u8*in,u32 len,u32 nrows,u8*planes,u32 pb,u32*keyoff,u32*keylen,u8*ktype,u8*kmaxfd,u32*st,u8*ckey,double*cval,u8*cfd,u32*llen,u32*lval){
  u32 p=0,row=0,nk=0,nc=0,nl=0,nlv=0;
  for(u32 i=0;i<512;i++) HT[i]=0;
  for(u32 i=0;i<MAXK;i++) LASTROW[i]=0xFFFFFFFFu;
#define BAIL(c) do{ st[0]=nk; st[1]=nc; st[2]=nl; st[3]=nlv; st[4]=row; st[5]=p; return (c); }while(0)
#define WS while(p<len&&(in[p]==' '||in[p]=='\t')) p++
  while(p<len){
    if(row>=nrows) BAIL(1);
    if(in[p]!='{') BAIL(2);
    p++; WS;
    if(p<len&&in[p]=='}'){ p++; }
    else for(;;){
      if(p>=len||in[p]!='"') BAIL(3);
      u32 ks=++p; u32 h=2166136261u; u32 alld=1;
      while(p<len&&in[p]!='"'){ u8 c=in[p]; if(c=='\\'||c<0x20) BAIL(4); if(c<'0'||c>'9') alld=0; h=(h^c)*16777619u; p++; }
      if(p>=len) BAIL(4);
      u32 kl=p-ks; p++;
      if(kl==0||alld) BAIL(5);   // integer-like keys are enumerated first by JavaScript: leave them to the other path
      if(kl==9){ const u8*q=in+ks; if(q[0]=='_'&&q[1]=='_'&&q[2]=='p'&&q[3]=='r'&&q[4]=='o'&&q[5]=='t'&&q[6]=='o'&&q[7]=='_'&&q[8]=='_') BAIL(5); }
      u32 slot=h&511, id=0xFFFFFFFFu;
      for(;;){ u32 e=HT[slot]; if(!e) break; u32 k=e-1; if(keylen[k]==kl){ u32 a=keyoff[k]; u32 z=0; while(z<kl&&in[a+z]==in[ks+z]) z++; if(z==kl){ id=k; break; } } slot=(slot+1)&511; }
      if(id==0xFFFFFFFFu){ if(nk>=MAXK) BAIL(6); id=nk++; HT[slot]=id+1; keyoff[id]=ks; keylen[id]=kl; ktype[id]=0; kmaxfd[id]=0; }
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
        llen[nl]=cnt; ckey[nc]=(u8)id; cval[nc]=(double)nl; cfd[nc]=0; nc++; nl++;
      } else if(c=='-'||(c>='0'&&c<='9')){
        if(ktype[id]==0) ktype[id]=1; else if(ktype[id]!=1) BAIL(8);
        u32 neg=0; if(c=='-'){ neg=1; p++; }
        if(p>=len||in[p]<'0'||in[p]>'9') BAIL(10);
        u64 m=0; u32 nd=0, fd=0;
        if(in[p]=='0'&&p+1<len&&in[p+1]>='0'&&in[p+1]<='9') BAIL(10);
        while(p<len&&in[p]>='0'&&in[p]<='9'){ m=m*10+(in[p]-'0'); if(++nd>15) BAIL(10); p++; }
        if(p<len&&in[p]=='.'){
          p++; if(p>=len||in[p]<'0'||in[p]>'9') BAIL(10);
          while(p<len&&in[p]>='0'&&in[p]<='9'){ m=m*10+(in[p]-'0'); if(++nd>15) BAIL(10); fd++; p++; }
          while(fd>0&&m%10==0){ m/=10; fd--; }   // 1.50 is 1.5 and 2.0 is the whole number 2, as JSON.parse sees them
        }
        if(p<len&&(in[p]=='e'||in[p]=='E')) BAIL(10);
        if(neg&&m==0) BAIL(11);   // -0
        if(fd>2) BAIL(12);
        if(fd>kmaxfd[id]) kmaxfd[id]=(u8)fd;
        ckey[nc]=(u8)id; cval[nc]=neg?-(double)m:(double)m; cfd[nc]=(u8)fd; nc++;
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
EXPORT("count") u32 count(const u8*in,u32 len,u32*out){   // newlines, colons, commas: bounds for the output arrays
  u32 nl=0,co=0,cm=0; for(u32 i=0;i<len;i++){ u8 c=in[i]; nl+=(c==10); co+=(c==':'); cm+=(c==','); }
  out[0]=nl; out[1]=co; out[2]=cm; return 0;
}
