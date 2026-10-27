// LFC-pack log templates, reader side. Rebuilds every line from the template blob, the u16 template ids and the slot streams in one pass.
// No libc, no static buffers: the caller lays every array out in linear memory and passes the pointers (memory sized from the frame lengths).
// Layout of the frames is that of lfc-pack 0.1.1 (see untemplate in lfc-pack.js): templates joined by 0 with slot marker 1; ids as little-endian u16 stored as n low bytes then n high bytes;
// numeric slots as zigzag delta varints, text slots joined by 10 inside a slot and by 0 between slots; kinds[j] = 1 numeric, 0 text, slots numbered in first-use order.
// Build: sh build.sh (clang --target=wasm32, see build.sh).
typedef unsigned char u8; typedef unsigned int u32; typedef long long i64; typedef unsigned long long u64;
#define EXPORT(n) __attribute__((export_name(n)))
static inline void cpy(u8*d,const u8*s,u32 n){ if(n>=32){ __builtin_memcpy(d,s,n); return; } for(u32 i=0;i<n;i++) d[i]=s[i]; }
// scratch sizes (bytes): toff 4*(ntm+1), sb 4*ntm, tc 4*ntm, seen ntm, ms 4*(ntm+1), mk 4*nmark, npos 4*nmark, tpos 4*nmark, acc 8*nmark (nmark = number of 1 bytes in tb)
// returns the number of bytes written to out (rows separated by 0, none after the last row)
EXPORT("rebuild") u32 rebuild(u8*tb,u32 tblen,u32 ntm,u8*ib,u32 n,u8*nb,u8*tx,u32 txlen,u8*kd,u8*out,u32*toff,u32*sb,u32*tc,u8*seen,u32*ms,u32*mk,u32*npos,u32*tpos,i64*acc){
  { u32 t=0; toff[0]=0; for(u32 i=0;i<tblen;i++) if(tb[i]==0) toff[++t]=i+1; toff[ntm]=tblen+1; }
  { u32 m=0; for(u32 t=0;t<ntm;t++){ ms[t]=m; for(u32 x=toff[t];x<toff[t+1]-1;x++) if(tb[x]==1) mk[m++]=x; } ms[ntm]=m; }
  for(u32 t=0;t<ntm;t++){ tc[t]=0; seen[t]=0; }
  u32 ns=0;
  for(u32 r=0;r<n;r++){ u32 t=ib[r]|((u32)ib[n+r]<<8); tc[t]++; if(!seen[t]){ seen[t]=1; sb[t]=ns; ns+=ms[t+1]-ms[t]; } }
  u32 np=0, tp=0;
  for(u32 t=0;t<ntm;t++) seen[t]=0;
  for(u32 r=0;r<n;r++){ u32 t=ib[r]|((u32)ib[n+r]<<8); if(seen[t]) continue; seen[t]=1;
    u32 c=tc[t]; for(u32 k=0, kk=ms[t+1]-ms[t]; k<kk; k++){ u32 j=sb[t]+k; acc[j]=0;
      if(kd[j]){ npos[j]=np; for(u32 q=0;q<c;q++){ while(nb[np]>=128) np++; np++; } }
      else { tpos[j]=tp; u32 q=0; while(q<c){ while(tp<txlen && tx[tp]!=10 && tx[tp]!=0) tp++; q++; if(q<c) tp++; } tp++; }
    } }
  u32 w=0;
  for(u32 r=0;r<n;r++){
    u32 t=ib[r]|((u32)ib[n+r]<<8);
    u32 q=toff[t], e=toff[t+1]-1, j=sb[t];
    for(u32 m=ms[t], me=ms[t+1]; m<me; m++, j++){
      u32 x=mk[m];
      cpy(out+w,tb+q,x-q); w+=x-q; q=x+1;
      if(kd[j]){
        u32 p=npos[j]; u32 b=nb[p++]; u64 u=b&127;
        if(b>=128){ int sh=7; do{ b=nb[p++]; u|=(u64)(b&127)<<sh; sh+=7; }while(b>=128); }
        npos[j]=p; i64 d=(u&1)?-(i64)((u+1)>>1):(i64)(u>>1); i64 v=acc[j]+d; acc[j]=v;
        if(v<0){ out[w++]='-'; v=-v; }
        if(v<=0xFFFFFFFFLL){ u32 xx=(u32)v; u32 l=1; if(xx>=10){ l=2; if(xx>=100){ l=3; if(xx>=1000){ l=4; if(xx>=10000){ l=5; u32 yy=xx; while(yy>=100000){ yy/=10; l++; } } } } } u32 z=w+l; w=z; while(l>0){ u32 qd=xx/10; out[--z]=(u8)('0'+(xx-qd*10)); xx=qd; l--; } }
        else { u8 tmp[24]; int l=0; while(v>0){ tmp[l++]=(u8)('0'+v%10); v/=10; } while(l>0) out[w++]=tmp[--l]; }
      } else {
        u32 p=tpos[j], s0=p; while(p<txlen && tx[p]!=10 && tx[p]!=0) p++;
        cpy(out+w,tx+s0,p-s0); w+=p-s0; tpos[j]=p+1;
      }
    }
    cpy(out+w,tb+q,e-q); w+=e-q;
    if(r+1<n) out[w++]=0;
  }
  return w;
}
