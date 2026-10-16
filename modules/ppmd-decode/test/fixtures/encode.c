/* Copyright (c) 2026 LFC Foundry. MIT License.
   Tiny command-line driver around the public-domain PPMd7 encoder of 7-Zip (Igor Pavlov's Ppmd7.c / Ppmd7Enc.c), used by make.js
   to write the fixtures: ppmd7enc INFILE OUTFILE ORDER MEMBYTES. It prints the number of bytes written.
   Build: gcc -O2 -I<folder with Ppmd7.h, Arch.h, Interface.h> -o ppmd7enc encode.c <folder>/Ppmd7.c <folder>/Ppmd7Enc.c
   (the headers Arch.h and Interface.h with IByteOut/IAlloc are the small shims that ship with the pyppmd 1.3.1 sources; adapt the includes
   to your copy of the 7-Zip/LZMA SDK). The output is the raw stream 7-Zip stores in a .7z archive: it starts with a zero byte. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "Arch.h"
#include "Interface.h"
#include "Ppmd7.h"
static Byte *obuf; static size_t opos;
static void wr(const IByteOut *p, Byte b){ obuf[opos++]=b; }
static void *al(size_t s){return malloc(s);} static void fr(void*a){free(a);}
int main(int argc,char**argv){
  FILE*f=fopen(argv[1],"rb"); fseek(f,0,SEEK_END); size_t n=ftell(f); fseek(f,0,SEEK_SET); Byte*b=malloc(n); fread(b,1,n,f);
  int order=atoi(argv[3]); UInt32 mem=atol(argv[4]); obuf=malloc(n*2+100);
  IByteOut out={wr}; IAlloc a={al,fr}; CPpmd7 p; CPpmd7z_RangeEnc rc; rc.Stream=&out;
  Ppmd7_Construct(&p); Ppmd7_Alloc(&p,mem,&a); Ppmd7z_RangeEnc_Init(&rc); Ppmd7_Init(&p,order);
  for(size_t i=0;i<n;i++) Ppmd7_EncodeSymbol(&p,&rc,b[i]);
  Ppmd7z_RangeEnc_FlushData(&rc);
  f=fopen(argv[2],"wb"); fwrite(obuf,1,opos,f); fclose(f); printf("%zu\n",opos); return 0; }
