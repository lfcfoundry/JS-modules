/*!
 * netflow-layers.js: lay out a graph in rows (a Sugiyama-style layered drawing): top to bottom or left to right, with long links as tags, story order, a column for the pages every route passes, and tall maps cut into columns. No dependencies.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.13.0 (API 1)
 *
 *   var R = NetflowLayers.layout({ nodes: [{ id: "start", w: 140, h: 44 }, { id: "a", w: 140, h: 44 }], edges: [{ from: "start", to: "a" }], root: "start" }, { dir: "TB" });
 *   svgElement.innerHTML = NetflowLayers.toSvg(R);          // or draw R.nodes and R.edges yourself (see README)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetflowLayers = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* The row-order search and the row placement of layered() in WebAssembly (wasm/order.c; build: sh wasm/build.sh; embed: python3 wasm/embed.py). The same rows and places to the last digit as the
   * JavaScript below, which stays as the fallback: WebAssembly missing, blocked by the page rule (only 'wasm-unsafe-eval' is needed), a map under `min` stops (default 100, so a small first map does not pay the one-time compile), or any trouble inside a call.
   * `NetflowLayers.wasm.on = false` turns it off; `.calls` counts the steps it ran, `.error` holds the last reason it fell back. */
  var WASM = { b64: /*WASM:order:BEGIN*/'AGFzbQEAAAABKwdgAX8BfGAFf39/f38AYAN/f38AYAN/f3wBfGABfwBgA398fwF8YAJ/fwADCwoAAAECAwQBBQYGBQMBABAGDwJ/AUGQiAELfwBBkIgBCwcvBQZtZW1vcnkCAAVvcmRlcgAABXBsYWNlAAUEc2lmdAAHC19faGVhcF9iYXNlAwEKgH8KiQwEEX8CfAR/AXwgACgCECIBIAAoAgwiAkohAyAAKAKYAUEASiEEIAAoAqQBIQUgACgCICEGIAAoAhwhByAAKAIUIQggACgCACEJAkAgACgCBCIKQRVsIgtBAmoiDEEBSA0AIAAoAqgBIQ0gDEEHcSEOQQAhDwJAIAtBAWpBB0kNACAMQfj///8HcSELQQAhDyANIQwDQCAMQgA3AgAgDEEYakIANwIAIAxBEGpCADcCACAMQQhqQgA3AgAgDEEgaiEMIAsgD0EIaiIPRw0ACwsgDkUNACANIA9BAnRqIQwDQCAMQQA2AgAgDEEEaiEMIA5Bf2oiDg0ACwsgBCADcSENIAVBAEchEEEAQQA2AoCIgIAAAkAgCUEBSA0AIAlBA3EhC0EAIQMCQCAJQQRJDQAgCUH8////B3EhBEEAIQxBACEDA0AgBiAMaiIOIAcgDGoiDygCADYCACAOQQRqIA9BBGooAgA2AgAgDkEIaiAPQQhqKAIANgIAIA5BDGogD0EMaigCADYCACAMQRBqIQwgBCADQQRqIgNHDQALCyALRQ0AIAcgA0ECdCIOaiEMIAYgDmohDgNAIA4gDCgCADYCACAMQQRqIQwgDkEEaiEOIAtBf2oiCw0ACwsgDSAQcSERIAAQgYCAgAAiEkQAAAAAAAAAAGQhDEQAAAAAAADwvyETAkAgAUEBSA0AIBJEAAAAAAAAAABkRQ0AIAlBA3EhDSAJQXxxIQMgCUF/aiEUIBFBAXMhFSACQX9qIRYgCkF+aiEXRAAAAAAAAPC/IRNBACEEIApBAkghECAIRSEIA0AgBCACTiEPAkAgEA0AIA8gBCACa0GBgICAeHFBAUZxIQ5BASEMA0AgACAMIAAoAjAgACgCNCAOEIKAgIAAIAogDEEBaiIMRw0ACyAQDQAgFyEMA0AgACAMIAAoAjggACgCPCAOEIKAgIAAIAxBf2oiDEF/Rw0ACwsCQCAKQQFIDQAgCCAPckUNAEEAIQwDQCAAIAxBCBCDgICAACAKIAxBAWoiDEcNAAsLIAAQgYCAgAAiGCASIBggEmMiDBshEgJAIAxFDQAgCUEBSA0AQQAhCwJAIBRBA0kNAEEAIQxBACELA0AgBiAMaiIOIAcgDGoiDygCADYCACAOQQRqIA9BBGooAgA2AgAgDkEIaiAPQQhqKAIANgIAIA5BDGogD0EMaigCADYCACAMQRBqIQwgAyALQQRqIgtHDQALCwJAIA1FDQAgByALQQJ0Ig5qIQwgBiAOaiEOIA0hDwNAIA4gDCgCADYCACAMQQRqIQwgDkEEaiEOIA9Bf2oiDw0ACwsgGCESCyATIBIgFSAEIBZHciIMGyETAkAgDA0AIAlBAUgNAEEAIQsCQCAUQQNJDQBBACEMQQAhCwNAIAUgDGoiDiAGIAxqIg8oAgA2AgAgDkEEaiAPQQRqKAIANgIAIA5BCGogD0EIaigCADYCACAOQQxqIA9BDGooAgA2AgAgDEEQaiEMIAMgC0EEaiILRw0ACwsgEiETIA1FDQAgBiALQQJ0Ig5qIQwgBSAOaiEOIA0hDwNAIA4gDCgCADYCACAMQQRqIQwgDkEEaiEOIA9Bf2oiDw0ACyASIRMLIBJEAAAAAAAAAABkIQwgBEEBaiIEIAFODQEgEkQAAAAAAAAAAGQNAAsLAkAgACgCmAFBAUgNACAMRQ0AIAAgBiASEISAgIAAIRIgESATRAAAAAAAAAAAZHFBAUcNACAAIAUgExCEgICAACITIBIgEyASYyIAGyESIABFDQAgCUEBSA0AIAlBA3EhDkEAIQ8CQCAJQX9qQQNJDQAgCUF8cSELQQAhAEEAIQ8DQCAGIABqIgwgBSAAaiIKKAIANgIAIAxBBGogCkEEaigCADYCACAMQQhqIApBCGooAgA2AgAgDEEMaiAKQQxqKAIANgIAIABBEGohACALIA9BBGoiD0cNAAsLAkAgDkUNACAFIA9BAnQiDGohACAGIAxqIQwDQCAMIAAoAgA2AgAgAEEEaiEAIAxBBGohDCAOQX9qIg4NAAsLIBMhEgsgEgvyBAQBfA9/AXwDf0QAAAAAAAAAACEBAkAgACgCBCICQQJIDQBEAAAAAAAAAAAhAUEBIQNBACEEA0AgAyEFIAAoAhggBEECdGoiA0EIaigCACADQQRqKAIAIgZrIgdBAWohCCADKAIAIQkgACgCRCEKIAAoAjwhCyAAKAI4IQwgACgCJCENIAAoAhwhDgJAIAdBf0gNACAHQQJqIgNBB3EhBEEAIQ8CQCAIQQdJDQAgA0F4cSEQQQAhDyAKIQMDQCADQgA3AgAgA0EYakIANwIAIANBEGpCADcCACADQQhqQgA3AgAgA0EgaiEDIBAgD0EIaiIPRw0ACwsgBEUNACAKIA9BAnRqIQMDQCADQQA2AgAgA0EEaiEDIARBf2oiBA0ACwtEAAAAAAAAAAAhEQJAIAkgBk4NAEQAAAAAAAAAACERQQAhEgNAAkAgDCAOIAlBAnRqKAIAQQJ0aiIDKAIAIhMgA0EEaigCACIUTg0AIBMhEANAQQAhBAJAIA0gCyAQQQJ0aigCAEECdGooAgAiA0EASA0AIANBAWohA0EAIQQDQCAKIANBAnRqKAIAIARqIQQgA0F/aiADcSIPIQMgDw0ACwsgESASIARrt6AhESAQQQFqIhAgFEcNAAsgEyEPA0ACQCANIAsgD0ECdGooAgBBAnRqKAIAIgMgB0oNACADQQFqIQMDQCAKIANBAnRqIgQgBCgCAEEBajYCACADQQAgA2txIANqIgMgCEwNAAsLIA9BAWoiDyAURw0ACyASIBNrIBRqIRILIAlBAWoiCSAGRw0ACwsgASARoCEBIAUhBCAFQQFqIgMgAkcNAAsLIAEL6xYDFn8BfAV/IAAoAqgBIgUgAUF/aiABQQFqIgYgACgCMCIHIAJGG0ECdGpBBGooAgAhCCAAKAIYIgkgAUECdGooAgAhCiAJIAZBAnQiC2ooAgAhDCAFIAtqKAIAIQ0gACgCLCEOIAAoAkAhDyAAKAIkIRAgACgCHCERAkACQCAFIAAoAgRBAnRqIAFBBWwgBGogByACR0EBdGpBBHRqQQhqIhIoAgBBAUcNACASKAIEIA1HDQAgEigCCCAIRg0BCwJAAkAgDCAKayITQQFIDQAgD0F8aiEUIBEgCkECdGohFUEAIRYDQCACIBUgFkECdGooAgAiF0ECdCIFaiIBQQRqKAIAIgsgASgCACIJayEYAkACQCAERQ0AIAsgCUYNAAJAIBhBAUgNACADIAlBAnRqIRlBACELIBQhGgNAIBAgGSALQQJ0aigCAEECdGooAgAhCUEAIQUCQCALRQ0AIBohASALIQUDQCABKAIAIgcgCUwNASABQQRqIAc2AgAgAUF8aiEBIAVBf2oiBUEBakEBSg0AC0EAIQULIA8gBUECdGogCTYCACAaQQRqIRogC0EBaiILIBhHDQALCyAPIBhBAXRBfHFqIQECQCAYQQFxRQ0AIAEoAgC3IRsMAgsgASgCACABQXxqKAIAardEAAAAAAAA4D+iIRsMAQsCQCALIAlGDQBEAAAAAAAAAAAhGwJAIAsgCUwNAAJAAkAgGEEDcSIHDQBEAAAAAAAAAAAhGyAJIQUMAQsgAyAJQQJ0aiEBRAAAAAAAAAAAIRsgCSEFA0AgBUEBaiEFIBsgECABKAIAQQJ0aigCALegIRsgAUEEaiEBIAdBf2oiBw0ACwsgCSALa0F8Sw0AIAsgBWshByADIAVBAnRqIQEDQCAbIBAgASgCAEECdGooAgC3oCAQIAFBBGooAgBBAnRqKAIAt6AgECABQQhqKAIAQQJ0aigCALegIBAgAUEMaigCAEECdGooAgC3oCEbIAFBEGohASAHQXxqIgcNAAsLIBsgGLejIRsMAQsgECAFaigCALchGwsgDiAXQQN0aiAbOQMAIBZBAWoiFiATRw0ACyATQQFGDQAgCkF/cyAMaiEHIAAoAiQhFiAAKAIoIQUgESAKQQJ0aiIaIQEDQAJAAkAgBSABKAIAIhhBA3QiCWorAwAgBSABQQRqIgEoAgAiD0EDdCILaisDAKEiG0QAAAAAAAAAAGENACAbRAAAAAAAAAAAYw0BDAQLAkAgACgCLCIZIAlqKwMAIBkgC2orAwChIhtEAAAAAAAAAABhDQAgG0QAAAAAAAAAAGMNAQwECyAWIBhBAnRqKAIAIBYgD0ECdGooAgBODQMLIAdBf2oiBw0ACwsgEiAINgIIIBIgDTYCBCASQQE2AgAPC0EAIQRBAEEBOgCEiICAAEEAQQAoAoCIgIAAQQFqIgE2AoCIgIAAIAAoAqgBIAZBAnRqIAE2AgAgACgCSCEcIBohFUEQIQ4DQAJAIAQiGUEBciIWIBlBEGoiBCATIAQgE0giAxtODQAgEyAOIBMgDkgbIQIgFSEXA0AgGiAWQQJ0aigCACELIBYhBQJAIBYgGU0NACAXIQEgFiEFA0ACQAJAIAAoAigiCSALQQN0IhhqKwMAIAkgASgCACIHQQN0Ig9qKwMAoSIbRAAAAAAAAAAAYQ0AIBtEAAAAAAAAAABjDQEMAwsCQCAAKAIsIgkgGGorAwAgCSAPaisDAKEiG0QAAAAAAAAAAGENACAbRAAAAAAAAAAAYw0BDAMLIAAoAiQiCSALQQJ0aigCACAJIAdBAnRqKAIATg0CCyABQQRqIAc2AgAgAUF8aiEBIAVBf2oiBSAZSg0ACwsgGiAFQQJ0aiALNgIAIBdBBGohFyAWQQFqIhYgAkcNAAsLIBVBwABqIRUgDkEQaiEOIAMNAAsCQCATQRFIDQAgESAKQQJ0aiEdQRAhHgNAIB5BA3QhCCAeQX9qIR9BACEMQQAgHkEBdCIGayEgIBohBCAcIQIgBiENIB4hGEEAIRIDQCASIhcgBmohEgJAAkACQCAAKAIoIgEgGiAYQQJ0aiIFKAIAIglBA3QiB2orAwAgASAFQXxqKAIAIgtBA3QiBWorAwChIhtEAAAAAAAAAABhDQAgG0QAAAAAAAAAAGNFDQIMAQsCQCAAKAIsIgEgB2orAwAgASAFaisDAKEiG0QAAAAAAAAAAGENACAbRAAAAAAAAAAAYw0BDAILIAAoAiQiASAJQQJ0aigCACABIAtBAnRqKAIATg0BCyASIBMgEiATSBshFiAXIQEgGCEFIBchCQJAIBcgGE4NACAXIQEgGCEFIBchCSACIQsgGCAWTg0AA0ACQAJAIAAoAigiByAaIAVBAnRqIg8oAgAiA0EDdCIOaisDACAHIBogAUECdGoiGSgCACIUQQN0IhVqKwMAoSIbRAAAAAAAAAAAYQ0AIBtEAAAAAAAAAABjIQcMAQsCQCAAKAIsIgcgDmorAwAgByAVaisDAKEiG0QAAAAAAAAAAGENACAbRAAAAAAAAAAAYyEHDAELIAAoAiQiByADQQJ0aigCACAHIBRBAnRqKAIASCEHCyALIA8gGSAHGygCADYCACAJQQFqIQkgBSAHaiEFIAEgB0EBc2oiASAYTg0BIAtBBGohCyAFIBZIDQALCwJAIBggAUwNACAfIBdqIAFrIQ8CQCAYIAFrQQNxIgtFDQAgCSALaiEZIAEgC2ohDiAdIAFBAnRqIQEgHCAJQQJ0aiEHA0AgByABKAIANgIAIAFBBGohASAHQQRqIQcgC0F/aiILDQALIBkhCSAOIQELIA9BA0kNACAcIAlBAnRqIQcgHSABQQJ0aiELA0AgByALKAIANgIAIAdBBGogC0EEaigCADYCACAHQQhqIAtBCGooAgA2AgAgB0EMaiALQQxqKAIANgIAIAdBEGohByALQRBqIQsgCUEEaiEJIAFBBGoiASAYSA0ACwsgDSATIA0gE0gbIRgCQCAFIBZODQACQCAYIAVrQQNxIg9FDQAgHSAFQQJ0aiEBIBwgCUECdGohByAPQQJ0IQsDQCAHIAEoAgA2AgAgAUEEaiEBIAdBBGohByALQXxqIgsNAAsLIAUgGGtBfEsNACAYIAUgD2oiBWshByAcIAkgD2pBAnRqIQEgHSAFQQJ0aiEFA0AgASAFKAIANgIAIAFBBGogBUEEaigCADYCACABQQhqIAVBCGooAgA2AgAgAUEMaiAFQQxqKAIANgIAIAFBEGohASAFQRBqIQUgB0F8aiIHDQALCyAXIBZODQAgGEEDcSIFQQJ0IQEgICAMbCAYakF/aiEHAkAgBUUNACAXIAVqIRdBACEFA0AgBCAFaiACIAVqKAIANgIAIAEgBUEEaiIFRw0ACwsgB0EDSQ0AA0AgBCABaiIFIAIgAWoiBygCADYCACAFQQRqIAdBBGooAgA2AgAgBUEIaiAHQQhqKAIANgIAIAVBDGogB0EMaigCADYCACABQRBqIQEgF0EEaiIXIBZIDQALCyAEIAhqIQQgAiAIaiECIAxBAWohDCANIAZqIQ0gEiAeaiIYIBNIDQALIAYhHiAGIBNIDQALCyATQQEgE0EBShsiBUEDcSEHQQAhAQJAIBNBBEgNACAFQfz///8HcSEFQQAhAQNAIBAgGigCAEECdGogATYCACAQIBpBBGooAgBBAnRqIAFBAWo2AgAgECAaQQhqKAIAQQJ0aiABQQJqNgIAIBAgGkEMaigCAEECdGogAUEDajYCACAaQRBqIRogAUEEaiIBIAVHDQALCyAHRQ0AIBEgAUECdCAKQQJ0amohBQNAIBAgBSgCAEECdGogATYCACAFQQRqIQUgAUEBaiEBIAdBf2oiBw0ACwsLwQoBI38jgICAgABBEGshAyAAKAKoASIEIAAoAgQiBUECdGogAUHQAGxqIgZBCGohByAAKAIYIgggAUECdCIJaigCACEKIAggAUEBaiILQQJ0IgxqKAIAIQ0gBCAJaiIIKAIAIQ4gCEEIaigCACEPIAQgDGooAgAhECAAKAIoIREgACgCJCESIAAoAhwhBAJAAkAgBkHIAGooAgBBAUcNACAHQcQAaigCACAORw0AIAdByABqKAIAIBBHDQAgB0HMAGooAgAgD0YNAQsCQCANIAprIhNBAkgNACAEIApBAnRqIRQgAkEAIAJBAEobIRVBACEWQQAhFwJAA0AgFiAVRg0BIBZBAWohFkEAIRhBASEEQQAhDQNAIA0hGSAEIQ0gFCAZQQJ0aiIaKAIAIRsgGkEEaiIcKAIAIR0gA0EANgIMIANBADYCCAJAIBEgG0EDdGorAwAgESAdQQN0aisDAGINAAJAIAsgBU4NACAAKAI4IgogG0ECdGoiBCgCACICIARBBGooAgAiHk4NACAKIB1BAnRqIgRBBGooAgAiHyAEKAIAIiBMDQAgACgCJCEIIAAoAjwiISAgQQJ0aiEiIB8gIGtBAXEhIyAfICBBAWoiJEYhJQNAIAggISACQQJ0aigCAEECdGooAgAhCiAgIQQCQCAjRQ0AIANBDGohBgJAIAogCCAiKAIAQQJ0aigCACIJSg0AIANBCGohBiAkIQQgCiAJTg0BCyAGIAYoAgBBAWo2AgAgJCEECwJAICUNACAfIARrIQkgISAEQQJ0aiEEA0AgA0EMaiEGAkACQCAKIAggBCgCAEECdGooAgAiDEoNACADQQhqIQYgCiAMTg0BCyAGIAYoAgBBAWo2AgALIANBDGohBgJAAkAgCiAIIARBBGooAgBBAnRqKAIAIgxKDQAgA0EIaiEGIAogDE4NAQsgBiAGKAIAQQFqNgIACyAEQQhqIQQgCUF+aiIJDQALCyACQQFqIgIgHkcNAAsLAkAgAUEBSA0AIAAoAjAiCiAbQQJ0aiIEKAIAIgIgBEEEaigCACIeTg0AIAogHUECdGoiBEEEaigCACIfIAQoAgAiIEwNACAAKAIkIQggACgCNCIhICBBAnRqISIgHyAga0EBcSEjIB8gIEEBaiIkRiElA0AgCCAhIAJBAnRqKAIAQQJ0aigCACEKICAhBAJAICNFDQAgA0EMaiEGAkAgCiAIICIoAgBBAnRqKAIAIglKDQAgA0EIaiEGICQhBCAKIAlODQELIAYgBigCAEEBajYCACAkIQQLAkAgJQ0AIB8gBGshCSAhIARBAnRqIQQDQCADQQxqIQYCQAJAIAogCCAEKAIAQQJ0aigCACIMSg0AIANBCGohBiAKIAxODQELIAYgBigCAEEBajYCAAsgA0EMaiEGAkACQCAKIAggBEEEaigCAEECdGooAgAiDEoNACADQQhqIQYgCiAMTg0BCyAGIAYoAgBBAWo2AgALIARBCGohBCAJQX5qIgkNAAsLIAJBAWoiAiAeRw0ACwsgAygCCCADKAIMTg0AIBIgG0ECdGogDTYCACASIB1BAnRqIBk2AgAgHCAbNgIAIBogHTYCAEEBIRdBAEEBOgCEiICAAEEBIRgLIA1BAWoiBCATRw0ACyAYDQALCyAXRQ0AQQBBACgCgIiAgABBAWoiAzYCgIiAgAAgACgCqAEgC0ECdGogAzYCACAHQcAAakEANgIADwsgB0HMAGogDzYCACAHQcgAaiAQNgIAIAdBxABqIA42AgAgB0HAAGpBATYCAAsLzQkCEH8BfCAAKAKgASEDIAAoAhghBCAAKAIkIQUgACgCHCEGIAAoAgQhBwJAIAAoAgAiCEEBSA0AIAhBA3EhCUEAIQoCQCAIQQRJDQAgCEH8////B3EhC0EAIQxBACEKA0AgBiAMaiINIAEgDGoiDigCADYCACANQQRqIA5BBGooAgA2AgAgDUEIaiAOQQhqKAIANgIAIA1BDGogDkEMaigCADYCACAMQRBqIQwgCyAKQQRqIgpHDQALCyAJRQ0AIAEgCkECdCINaiEMIAYgDWohDQNAIA0gDCgCADYCACAMQQRqIQwgDUEEaiENIAlBf2oiCQ0ACwsCQCAHQQFIDQAgB0EDcSENQQAhDgJAIAdBBEkNACAHQfz///8HcSEKQRAhDEEAIQ4DQEEAQQAoAoCIgIAAQQFqIgk2AoCIgIAAIAAoAqgBIAxqQXRqIAk2AgBBAEEAKAKAiICAAEEBaiIJNgKAiICAACAAKAKoASAMakF4aiAJNgIAQQBBACgCgIiAgABBAWoiCTYCgIiAgAAgACgCqAEgDGpBfGogCTYCAEEAQQAoAoCIgIAAQQFqIgk2AoCIgIAAIAAoAqgBIAxqIAk2AgAgDEEQaiEMIAogDkEEaiIORw0ACwsCQCANRQ0AIA5BAnRBBGohDANAQQBBACgCgIiAgABBAWoiDjYCgIiAgAAgACgCqAEgDGogDjYCACAMQQRqIQwgDUF/aiINDQALCyAHQQFIDQAgBCgCACEOQQAhCwNAAkAgDiIMIAQgCyINQQFqIgtBAnRqIgkoAgAiDk4NACAEIA1BAnRqIQogBiAMQQJ0aiENA0AgBSANKAIAQQJ0aiAMIAooAgBrNgIAIA1BBGohDSAMQQFqIgwgCSgCACIOSA0ACwsgCyAHRw0ACwsCQCAAKAKYAUEBSA0AIAJEAAAAAAAAAABkRQ0AIAhB/P///wdxIQogCEEDcSEPIAdBfmohECAHQQJIIREgCEEESSESQQAhBUEAIQRBACELA0AgCyAAKAKcAU4NASAFQQFKDQFBAEEAOgCEiICAAAJAIBENACAEQQFxIQ1BASEMA0AgACAMIAAoAjAgACgCNCANEIKAgIAAIAAgDCADEIOAgIAAIAcgDEEBaiIMRw0ACyAQIQwgEQ0AA0AgACAMIAAoAjggACgCPCANEIKAgIAAIAAgDCADEIOAgIAAIAxBf2oiDEF/Rw0ACwsCQCAHQQFIDQBBACEMA0AgACAMIAMQg4CAgAAgByAMQQFqIgxHDQALCwJAAkAgABCBgICAACITIAJjRQ0AQQAhCwJAIAhBAUgNAEEAIQkCQCASDQBBACEMQQAhCQNAIAEgDGoiDSAGIAxqIg4oAgA2AgAgDUEEaiAOQQRqKAIANgIAIA1BCGogDkEIaigCADYCACANQQxqIA5BDGooAgA2AgAgDEEQaiEMIAogCUEEaiIJRw0ACwsgD0UNACAGIAlBAnQiDWohDCABIA1qIQ0gDyEOA0AgDSAMKAIANgIAIAxBBGohDCANQQRqIQ0gDkF/aiIODQALCyATIQIMAQsgC0EBaiELCyAEQQFqIgQgACgCmAFODQFBACAFQQFqQQAtAISIgIAAGyEFIAJEAAAAAAAAAABkDQALCyACC7MFARZ/IAAoAlQhASAAKAJ0IQIgACgCBCEDAkACQCAAKAIAIgRBAU4NAEEAIQUMAQsgACgCXCEGIAAoAlAhByAAKAJMIQggACgCWCEJIAAoAjwhCiAAKAI4IQsgACgCNCEMIAAoAjAhDUEAIQ5BACEFA0AgASAOQQJ0Ig9qIAU2AgACQCANIA9qKAIAIhAgDSAOQQFqIg5BAnQiEWoiEigCAE4NACAJIAVBAnRqIRMgBiAFQQN0aiEUIAwgEEECdGohFSAIIBBBA3RqIRYDQCATIBUoAgA2AgAgFCAWKwMAOQMAIBNBBGohEyAUQQhqIRQgFUEEaiEVIBZBCGohFiAFQQFqIQUgEEEBaiIQIBIoAgBIDQALCwJAIAsgD2ooAgAiECALIBFqIhIoAgBODQAgCSAFQQJ0aiETIAYgBUEDdGohFCAKIBBBAnRqIRUgByAQQQN0aiEWA0AgEyAVKAIANgIAIBQgFisDADkDACATQQRqIRMgFEEIaiEUIBVBBGohFSAWQQhqIRYgBUEBaiEFIBBBAWoiECASKAIASA0ACwsgDiAERw0ACwsgASAEQQJ0aiAFNgIAAkAgAkEBSA0AIANBAkgNACADQX9qIRVBACETA0ACQAJAIBNBA3BBAkYiFA0AQQEhBQNAIAAgBSAAKAIwIAAoAjQgACgCTBCGgICAACADIAVBAWoiBUcNAAwCCwtBASEFA0AgACAFIAAoAlQgACgCWCAAKAJcEIaAgIAAIAMgBUEBaiIFRw0ACwsgFSEFAkACQCAURQ0AIBUhBQNAIAAgBUF/aiIFIAAoAlQgACgCWCAAKAJcEIaAgIAAIAVBAEoNAAwCCwsDQCAAIAVBf2oiBSAAKAI4IAAoAjwgACgCUBCGgICAACAFQQBKDQALCyATQQFqIhMgAkcNAAsLC/ESBBl/AnwCfwV8AkAgACgCGCABQQJ0aiIBQQRqKAIAIgUgASgCACIGRg0AIAAoAoQBIQdBACEIAkAgBSAGayIJQQBKDQAgB0IANwMADAELIAAoAnAhCiAAKAJsIQsgACgCaCEMIAAoApQBIQ0gACgCjAEhDiAAKAKIASEPIAAoAnwhECAAKAJ4IREgACgCZCESIAAoAmAhEyAAKAKQASEUIAAoAoABIhVBeGohFiAAKAIcIhcgBkECdGohGANAAkACQAJAAkACQCACIBggCEECdGooAgAiGUECdGoiAEEEaigCACIaIAAoAgAiG0wiHA0AIBogG0F/c2ohHUQAAAAAAAAAACEeRAAAAAAAAAAAIR8gGyEBAkAgGiAbayIgQQFxRQ0AIBMgAyAbQQJ0aigCAEEDdGorAwAgBCAbQQN0aisDACIeokQAAAAAAAAAAKAhHyAbQQFqIQEgHkQAAAAAAAAAAKAhHgsCQCAdRQ0AIBogAWshISADIAFBAnRqIQAgBCABQQN0aiEBA0AgHiABKwMAIiKgIAFBCGorAwAiI6AhHiAfIBMgACgCAEEDdGorAwAgIqKgIBMgAEEEaigCAEEDdGorAwAgI6KgIR8gAEEIaiEAIAFBEGohASAhQX5qIiENAAsLIAwgGWotAAANASAeRAAAAAAAAAAAYg0CDAMLIAwgGWotAABFDQILIBEgCEEDdGpCADcDAEQAAAAAAECPQCEeDAILIB8gHqMhHwJAIApFDQAgCyAZai0AAA0AICBBAkgNAEQAAAAAAAD4fyEfAkAgHA0AAkACQCAgQQNxIgENAEQAAAAAAADwfyEfRAAAAAAAAPD/ISIMAQsgAyAbQQJ0aiEARAAAAAAAAPB/IR9EAAAAAAAA8P8hIgNAIBtBAWohGyAiIBMgACgCAEEDdGorAwAiI6UhIiAfICOkIR8gAEEEaiEAIAFBf2oiAQ0ACwsCQCAdQQNJDQAgGiAbayEBIAMgG0ECdGohAANAICIgEyAAKAIAQQN0aisDACIjpSATIABBBGooAgBBA3RqKwMAIiSlIBMgAEEIaigCAEEDdGorAwAiJaUgEyAAQQxqKAIAQQN0aisDACImpSEiIB8gI6QgJKQgJaQgJqQhHyAAQRBqIQAgAUF8aiIBDQALCyAfICKgIR8LIB9EAAAAAAAA4D+iIR8LIBEgCEEDdGogHzkDACAeRAAAAAAAAABARAAAAAAAAAAAIAsgGWotAAAboCEeDAELIBEgCEEDdGogEyAZQQN0aisDADkDAESamZmZmZnJPyEeCyAQIAhBA3QiAGogHjkDAAJAIAhFDQAgFiAAaiASIBlBA3RqKwMAOQMACyAIQQFqIgggCUcNAAsgB0IANwMAQQAhGAJAIAlBAUYNACAFIAZBf3NqIgFBA3EhCEQAAAAAAAAAACEeQQEhAAJAIAlBfmpBA0kNACABQXxxIRlEAAAAAAAAAAAhHkEAIQBBACEbA0AgByAAaiIBQQhqIB4gFSAAaiIhKwMAoCIeOQMAIAFBEGogHiAhQQhqKwMAoCIeOQMAIAFBGGogHiAhQRBqKwMAoCIeOQMAIAFBIGogHiAhQRhqKwMAoCIeOQMAIABBIGohACAZIBtBBGoiG0cNAAsgG0EBaiEACyAJQQFHIRggCEUNACAHIABBA3QiAWohACABIBVqQXhqIQEDQCAAIB4gASsDAKAiHjkDACABQQhqIQEgAEEIaiEAIAhBf2oiCA0ACwsCQAJAAkAgCUEBSA0AIA5BeGohAiAPQXhqIRwgFEF8aiEMQQAhGkEAIRkDQCAPIBlBA3QiAWogECAaQQN0IgBqIiErAwAgESAAaisDACAHIABqKwMAoaI5AwAgFCAZQQJ0IhtqQQE2AgAgDiABaiAhKwMAIh45AwAgGUEBaiEIAkACQCAZQQFODQAgCCEZDAELIAIgAWohACAcIAFqIQEgDCAbaiEhQQEhGwNAAkAgASsDACIfIAArAwCjIAFBCGorAwAiIiAeo2QNACAIIRkMAgsgASAfICKgOQMAICEgISgCACAbaiIbNgIAIAAgAEEIaisDACAAKwMAoCIeOQMAIABBeGohACABQXhqIQEgIUF8aiEhQQEhGSAIQX9qIghBAWpBAksNAAsLIBpBAWoiGiAJRw0ACwJAIBlBAUgNAEEAIRpBACEIA0ACQCAUIAhBAnRqKAIAIhtBAUgNACAPIAhBA3QiAGorAwAgDiAAaisDAKMhHiAaIRACQCAbQQNxIiFFDQAgGiAhaiEQIAcgGkEDdCIBaiEAIA0gAWohAQNAIAEgHiAAKwMAoDkDACAAQQhqIQAgAUEIaiEBICFBf2oiIQ0ACwsgGiAbaiEaIBtBBEkNACAbQXxxISEgByAQQQN0IgFqIQAgDSABaiEBA0AgASAeIAArAwCgOQMAIAFBCGogHiAAQQhqKwMAoDkDACABQRBqIB4gAEEQaisDAKA5AwAgAUEYaiAeIABBGGorAwCgOQMAIABBIGohACABQSBqIQEgIUF8aiIhDQALCyAIQQFqIgggGUcNAAsLIBgNAQwCCyAYRQ0CC0EBIQAgBSAGQX9zaiIBQQFxIRkgDSsDACEeAkAgBUF+aiAGRg0AIA1BEGohACABQX5xIRtBACEhIBUhAQNAAkAgAEF4aiIIKwMAIh8gHiABKwMAoCIeY0UNACAIIB45AwAgHiEfCwJAIAArAwAiHiAfIAFBCGorAwCgIh9jRQ0AIAAgHzkDACAfIR4LIAFBEGohASAAQRBqIQAgGyAhQQJqIiFHDQALICFBAWohAAsgGUUNACANIABBA3QiAGoiASsDACAeIBVBeGogAGorAwCgIh5jRQ0AIAEgHjkDAAsgCUEBSA0AIAlBA3EhIUEAIQgCQCAGIAVrQXxLDQAgFyAGQQJ0aiEAIAlB/P///wdxIRtBACEIIA0hAQNAIBMgACgCAEEDdGogASsDADkDACATIABBBGooAgBBA3RqIAFBCGorAwA5AwAgEyAAQQhqKAIAQQN0aiABQRBqKwMAOQMAIBMgAEEMaigCAEEDdGogAUEYaisDADkDACAAQRBqIQAgAUEgaiEBIBsgCEEEaiIIRw0ACwsgIUUNACAXIAhBAnQgBkECdGpqIQAgDSAIQQN0aiEBA0AgEyAAKAIAQQN0aiABKwMAOQMAIAFBCGohASAAQQRqIQAgIUF/aiIhDQALCwv4BwMMfwF8AX8gACgCGCEDIAAoAiQhBCAAKAIgIQUgACgCHCEGIAAoAgQhBwJAIAAoAgAiCEEBSA0AIAhBA3EhCUEAIQoCQCAIQQRJDQAgCEH8////B3EhC0EAIQxBACEKA0AgBiAMaiINIAUgDGoiDigCADYCACANQQRqIA5BBGooAgA2AgAgDUEIaiAOQQhqKAIANgIAIA1BDGogDkEMaigCADYCACAMQRBqIQwgCyAKQQRqIgpHDQALCyAJRQ0AIAUgCkECdCINaiEMIAYgDWohDQNAIA0gDCgCADYCACAMQQRqIQwgDUEEaiENIAlBf2oiCQ0ACwsCQCAHQQFIDQAgAygCACEOQQAhCwNAAkAgDiIMIAMgCyINQQFqIgtBAnRqIgkoAgAiDk4NACADIA1BAnRqIQogBiAMQQJ0aiENA0AgBCANKAIAQQJ0aiAMIAooAgBrNgIAIA1BBGohDSAMQQFqIgwgCSgCACIOSA0ACwsgCyAHRw0ACwsCQCACQQFIDQAgAUQAAAAAAAAAAGRFDQACQCAIQQBKDQAgB0EBaiEJQQAhDUEAIQ4DQAJAAkAgDUEBcUUNACAJIQwgB0EBSA0BA0AgACAMQX5qEIiAgIAAIAxBf2oiDEEBSw0ADAILCyAHQQFIDQBBACEMA0AgACAMEIiAgIAAIAcgDEEBaiIMRw0ACwsgAEEBEImAgIAAIABBABCJgICAACAAEIGAgIAAIg8gASAPIAFjIgwbIQEgDUEBaiINIAJODQIgAUQAAAAAAAAAAGRFDQJBACAOQQFqIAwbIg5BAkgNAAwCCwsgB0EBaiEQIAhB/P///wdxIQogCEEDcSEDIAhBBEkhCEEAIQRBACELA0ACQAJAIARBAXENACAHQQFIDQFBACEMA0AgACAMEIiAgIAAIAcgDEEBaiIMRw0ADAILCyAQIQwgB0EBSA0AA0AgACAMQX5qEIiAgIAAIAxBf2oiDEEBSw0ACwsgAEEBEImAgIAAIABBABCJgICAAAJAAkAgABCBgICAACIPIAFjRQ0AQQAhC0EAIQkCQCAIDQBBACEMQQAhCQNAIAUgDGoiDSAGIAxqIg4oAgA2AgAgDUEEaiAOQQRqKAIANgIAIA1BCGogDkEIaigCADYCACANQQxqIA5BDGooAgA2AgAgDEEQaiEMIAogCUEEaiIJRw0ACwsCQCADRQ0AIAYgCUECdCINaiEMIAUgDWohDSADIQ4DQCANIAwoAgA2AgAgDEEEaiEMIA1BBGohDSAOQX9qIg4NAAsLIA8hAQwBCyALQQFqIQsLIARBAWoiBCACTg0BIAFEAAAAAAAAAABkRQ0BIAtBAkgNAAsLIAEL+hcDH38BfAt/AkAgACgCGCABQQJ0aiICQQRqKAIAIAIoAgAiA2siBEECSA0AIAAoAighBSAAKAJAIQYgACgCSCEHIAAoAiQhCCAAQThqKAIAIQkgAEEwaigCACEKQQAhAiAAKAIcIgsgA0ECdGoiDCENIAQhDgNAIAogDSgCAEECdCIPQQRqIhBqKAIAIAkgEGooAgBqIAogD2ooAgAgCSAPaigCAGprIg8gAiAPIAJKGyECIA1BBGohDSAOQX9qIg4NAAsgAkECaiINQQdxIQ9BACEJAkAgAkEGSQ0AIA1BeHEhCkEAIQkgBiENA0AgDUIANwIAIA1BGGpCADcCACANQRBqQgA3AgAgDUEIakIANwIAIA1BIGohDSAKIAlBCGoiCUcNAAsLAkAgD0UNACAGIAlBAnRqIQ0DQCANQQA2AgAgDUEEaiENIA9Bf2oiDw0ACwsgAkEBaiERIARBASAEQQFKGyEJIAYgAkECdGoiEEEEaiESIABBOGohEyAAQTBqIRQgDCENA0AgEiAUKAIAIgogDSgCAEECdCIPaigCACAKIA9BBGoiDmooAgAgEygCACIKIA5qKAIAamtBAnRqIAogD2ooAgBBAnRqIg8gDygCAEEBajYCACANQQRqIQ0gCUF/aiIJDQALIBFBA3EhDyAGKAIAIQ1BASEJAkAgAkEDSQ0AIAZBEGohAiARQXxxIQ5BACEJA0AgAkF0aiIKIAooAgAgDWoiDTYCACACQXhqIgogCigCACANaiINNgIAIAJBfGoiCiAKKAIAIA1qIg02AgAgAiACKAIAIA1qIg02AgAgAkEQaiECIA4gCUEEaiIJRw0ACyAJQQFqIQkLAkAgD0UNACAGIAlBAnRqIQIDQCACIAIoAgAgDWoiDTYCACACQQRqIQIgD0F/aiIPDQALCyAEQQEgBEEBShshDyAAQThqIRIgAEEwaiETIAwhAgNAIBAgEygCACIJIAIoAgAiCkECdCINaigCACAJIA1BBGoiDmooAgAgEigCACIJIA5qKAIAamtBAnRqIAkgDWooAgBBAnRqIg0gDSgCACINQQFqNgIAIAcgDUECdGogCjYCACACQQRqIQIgD0F/aiIPDQALIARBASAEQQFKGyEVIAFBAWohFiADQQJ0IAtqIgJBcGohFyACQXxqIRggAkEEaiEZQQAhGiAAQTBqIRsgAEE4aiEcA0AgCCAHIBpBAnRqKAIAIh1BAnQiHmoiHygCACIgIRICQCAgQQFIDQAgGCAgQQJ0aiECIAUgHUEDdGorAwAhISAgIRIDQCAFIAIoAgBBA3RqKwMAICFiDQEgAkF8aiECIBJBAUohDSASQX9qIRIgDQ0AC0EAIRILIAQgIEEBaiICIAQgAkobQX9qIQkgIEF/aiETIBkgIEECdCIKaiECIAUgHUEDdGohDwJAA0ACQCATQQJqIARIDQAgCSETDAILIBNBAWohEyACKAIAIQ0gAkEEaiECIAUgDUEDdGorAwAgDysDAGENAAsLAkAgEiATRg0AIBwoAgAiAiAeQQRqIg1qKAIAIBsoAgAiDyANaigCAGogAiAeaigCACAPIB5qKAIAakYNAAJAICAgEkwNACAgIQICQCAgIBJrQQNxIg9FDQAgGCAKaiENICAhAgNAIA1BBGogDSgCACIJNgIAIAggCUECdGogAjYCACANQXxqIQ0gAkF/aiECIA9Bf2oiDw0ACwsgEiAga0F8Sw0AIBcgAkECdGohDQNAIA1BEGogDUEMaiIPKAIAIgk2AgAgCCAJQQJ0aiACNgIAIA8gDUEIaiIJKAIAIgo2AgAgCCAKQQJ0aiACQX9qNgIAIAkgDUEEaiIPKAIAIgo2AgAgCCAKQQJ0aiACQX5qNgIAIA8gDSgCACIJNgIAIAggCUECdGogAkF9ajYCACANQXBqIQ0gAkF8aiICIBJKDQALCyAMIBJBAnRqIB02AgAgHyASNgIAQQAhIgJAAkAgEiATSA0AIBIhI0EAISQMAQtBACEkIBIhI0EAISJBACElA0AgDCASIiZBAWoiEkECdGoiJygCACELIAAoAiQhAkEAIQ8CQCABQQFIIigNAEEAIQ8gGygCACIJIAtBAnRqIg0oAgAiDiANQQRqKAIAIhRODQBBACEPIAkgHmoiDUEEaigCACIpIA0oAgAiEUwNACAAKAI0IhAgEUECdGohKiApIBFrQQFxIQZBACEPICkgEUEBaiIrRiEDA0AgAiAQIA5BAnRqKAIAQQJ0aigCACEJAkACQCAGDQAgESENDAELIA8gCSACICooAgBBAnRqKAIASmohDyArIQ0LAkAgAw0AICkgDWshCiAQIA1BAnRqIQ0DQCAPIAkgAiANKAIAQQJ0aigCAEpqIAkgAiANQQRqKAIAQQJ0aigCAEpqIQ8gDUEIaiENIApBfmoiCg0ACwsgDkEBaiIOIBRHDQALCwJAIBYgACgCBE4iLA0AIBwoAgAiCSALQQJ0aiINKAIAIg4gDUEEaigCACIUTg0AIAkgHmoiDUEEaigCACIpIA0oAgAiEUwNACAAKAI8IhAgEUECdGohKiApIBFrQQFxIQYgKSARQQFqIitGIQMDQCACIBAgDkECdGooAgBBAnRqKAIAIQkCQAJAIAYNACARIQ0MAQsgDyAJIAIgKigCAEECdGooAgBKaiEPICshDQsCQCADDQAgKSANayEKIBAgDUECdGohDQNAIA8gCSACIA0oAgBBAnRqKAIASmogCSACIA1BBGooAgBBAnRqKAIASmohDyANQQhqIQ0gCkF+aiIKDQALCyAOQQFqIg4gFEcNAAsLQQAhCQJAICgNACAbKAIAIgogHmoiDSgCACIQIA1BBGooAgAiBk4NACAKIAtBAnRqIg1BBGooAgAiKiANKAIAIilMDQAgACgCNCIUIClBAnRqISsgKiApa0EBcSEDQQAhCSAqIClBAWoiKEYhEQNAIAIgFCAQQQJ0aigCAEECdGooAgAhCgJAAkAgAw0AICkhDQwBCyAJIAogAiArKAIAQQJ0aigCAEpqIQkgKCENCwJAIBENACAqIA1rIQ4gFCANQQJ0aiENA0AgCSAKIAIgDSgCAEECdGooAgBKaiAKIAIgDUEEaigCAEECdGooAgBKaiEJIA1BCGohDSAOQX5qIg4NAAsLIBBBAWoiECAGRw0ACwsCQCAsDQAgHCgCACIKIB5qIg0oAgAiECANQQRqKAIAIgZODQAgCiALQQJ0aiINQQRqKAIAIiogDSgCACIpTA0AIAAoAjwiFCApQQJ0aiErICogKWtBAXEhAyAqIClBAWoiKEYhEQNAIAIgFCAQQQJ0aigCAEECdGooAgAhCgJAAkAgAw0AICkhDQwBCyAJIAogAiArKAIAQQJ0aigCAEpqIQkgKCENCwJAIBENACAqIA1rIQ4gFCANQQJ0aiENA0AgCSAKIAIgDSgCAEECdGooAgBKaiAKIAIgDUEEaigCAEECdGooAgBKaiEJIA1BCGohDSAOQX5qIg4NAAsLIBBBAWoiECAGRw0ACwsgDCAmQQJ0aiALNgIAIAggC0ECdGogJjYCACAnIB02AgAgHyASNgIAIA8gCWsgJWoiJSAkIBIgIEYbISQgJSAiICUgIkgiAhshIiASICMgAhshIyASIBNHDQALCwJAIBMgIyAgICIgJEgbIg5MDQAgEyECAkAgEyAOa0EDcSIPRQ0AIBggE0ECdGohDSATIQIDQCANQQRqIA0oAgAiCTYCACAIIAlBAnRqIAI2AgAgDUF8aiENIAJBf2ohAiAPQX9qIg8NAAsLIA4gE2tBfEsNACAXIAJBAnRqIQ0DQCANQRBqIA1BDGoiDygCACIJNgIAIAggCUECdGogAjYCACAPIA1BCGoiCSgCACIKNgIAIAggCkECdGogAkF/ajYCACAJIA1BBGoiDygCACIKNgIAIAggCkECdGogAkF+ajYCACAPIA0oAgAiCTYCACAIIAlBAnRqIAJBfWo2AgAgDUFwaiENIAJBfGoiAiAOSg0ACwsgDCAOQQJ0aiAdNgIAIB8gDjYCAAsgGkEBaiIaIBVHDQALCwvhCgEffwJAIAAoAgQiAkEBSA0AIAAoAighAyAAKAIkIQQgACgCHCEFIAAoAhghBkEAIQcDQAJAIAYgByIIQQFqIgdBAnRqKAIAIAYgCEECdGooAgAiCWsiCkECSA0AIAUgCUECdGohC0EAIQxBASEJA0AgDCENIAkhDAJAIAMgCyANQQJ0aiIOKAIAIg9BA3RqKwMAIAMgDkEEaiIQKAIAIhFBA3RqKwMAYg0AIAAoAiQhCUEAIRICQCAIRQ0AIAAoAjAiEyAPQQJ0aiIUKAIAIhUgFEEEaigCACIWTg0AIBMgEUECdGoiFEEEaigCACIXIBQoAgAiGEwNACAAKAI0IhkgGEECdGohGiAXIBhrQQFxIRtBACESIBcgGEEBaiIcRiEdA0AgCSAZIBVBAnRqKAIAQQJ0aigCACETAkACQCAbDQAgGCEUDAELIBIgEyAJIBooAgBBAnRqKAIASmohEiAcIRQLAkAgHQ0AIBcgFGshHiAZIBRBAnRqIRQDQCASIBMgCSAUKAIAQQJ0aigCAEpqIBMgCSAUQQRqKAIAQQJ0aigCAEpqIRIgFEEIaiEUIB5BfmoiHg0ACwsgFUEBaiIVIBZHDQALCwJAIAcgACgCBE4iHw0AIAAoAjgiEyAPQQJ0aiIUKAIAIhUgFEEEaigCACIWTg0AIBMgEUECdGoiFEEEaigCACIXIBQoAgAiGEwNACAAKAI8IhkgGEECdGohGiAXIBhrQQFxIRsgFyAYQQFqIhxGIR0DQCAJIBkgFUECdGooAgBBAnRqKAIAIRMCQAJAIBsNACAYIRQMAQsgEiATIAkgGigCAEECdGooAgBKaiESIBwhFAsCQCAdDQAgFyAUayEeIBkgFEECdGohFANAIBIgEyAJIBQoAgBBAnRqKAIASmogEyAJIBRBBGooAgBBAnRqKAIASmohEiAUQQhqIRQgHkF+aiIeDQALCyAVQQFqIhUgFkcNAAsLQQAhEwJAIAhFDQAgACgCMCIeIBFBAnRqIhQoAgAiGSAUQQRqKAIAIhtODQAgHiAPQQJ0aiIUQQRqKAIAIhogFCgCACIXTA0AIAAoAjQiFiAXQQJ0aiEcIBogF2tBAXEhHUEAIRMgGiAXQQFqIiBGIRgDQCAJIBYgGUECdGooAgBBAnRqKAIAIR4CQAJAIB0NACAXIRQMAQsgEyAeIAkgHCgCAEECdGooAgBKaiETICAhFAsCQCAYDQAgGiAUayEVIBYgFEECdGohFANAIBMgHiAJIBQoAgBBAnRqKAIASmogHiAJIBRBBGooAgBBAnRqKAIASmohEyAUQQhqIRQgFUF+aiIVDQALCyAZQQFqIhkgG0cNAAsLAkAgHw0AIAAoAjgiHiARQQJ0aiIUKAIAIhkgFEEEaigCACIbTg0AIB4gD0ECdGoiFEEEaigCACIaIBQoAgAiF0wNACAAKAI8IhYgF0ECdGohHCAaIBdrQQFxIR0gGiAXQQFqIiBGIRgDQCAJIBYgGUECdGooAgBBAnRqKAIAIR4CQAJAIB0NACAXIRQMAQsgEyAeIAkgHCgCAEECdGooAgBKaiETICAhFAsCQCAYDQAgGiAUayEVIBYgFEECdGohFANAIBMgHiAJIBQoAgBBAnRqKAIASmogHiAJIBRBBGooAgBBAnRqKAIASmohEyAUQQhqIRQgFUF+aiIVDQALCyAZQQFqIhkgG0cNAAsLAkAgEyASSA0AIAFFDQEgEkEBSA0BIBMgEkcNAQsgDiARNgIAIBAgDzYCACAEIA9BAnRqIAw2AgAgBCARQQJ0aiANNgIACyAMQQFqIgkgCkcNAAsLIAcgAkcNAAsLCw=='/*WASM:order:END*/, on: true, min: 100, calls: 0, error: '', mod: null, inst: null, tried: false };
  /* deep: true: the deeper crossing search (max rounds, rounds with no gain before it stops, swap passes a row, most stops it runs on) */
  var DEEP = { max: 80, stall: 4, tg: 50, maxStops: 20000, liteMax: 12, liteStall: 4 };   // lite*: the lighter search that runs when deep is left out
  function wasmBytes() {
    if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(WASM.b64);
    var t = typeof atob === 'function' ? atob(WASM.b64) : Buffer.from(WASM.b64, 'base64').toString('latin1'), b = new Uint8Array(t.length), i;
    for (i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
    return b;
  }
  function wasmEngine() {
    if (!WASM.tried) {
      WASM.tried = true;
      try {
        if (typeof WebAssembly === 'object' && WebAssembly && WASM.b64) {
          WASM.inst = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes()), {}).exports;   // compiled here, once, on the first map of 100 stops or more
        }
      } catch (err) { WASM.error = String(err && err.message || err); WASM.inst = null; }
    }
    return WASM.inst;
  }
  var WASM_LISTS = ['NV', 'NL', 'MAXLEN', 'BASE', 'ROUNDS', 'BIG', 'rowOff', 'ord', 'best', 'pos', 'lane', 'bary', 'upOff', 'upIdx', 'dnOff', 'dnIdx', 'scr', 'fen', 'tmp',
    'upW', 'dnW', 'bothOff', 'bothIdx', 'bothW', 'cA', 'gap', 'choke', 'dummy', 'WIDE', 'ITERS', 'want', 'wt', 'gaps', 'off', 'bs', 'bw', 'bn', 'out', 'DEEPMAX', 'DEEPSTALL', 'DEEPTG', 'pre', 'ver'];
  /* Lay out the lists one call needs in wasm memory (grown once, here) and copy the fixed ones in. Returns null when that cannot be done. */
  /* sift: see layout(); L rows of stops (each with .idx and .pos), posA place by stop number, up/down neighbor lists; returns the crossings */
  var SIFT = { calls: 0 };
  function siftRows(L, posA, laneA, up, down, nV, nL, maxLen, maxSeg, startC, rounds) {
    var keyBuf = new Float64Array(Math.max(1, maxSeg)), fen = new Int32Array(maxLen + 2), deg = new Int32Array(nV), k, i;
    for (i = 0; i < nV; i++) deg[i] = up.off[i + 1] - up.off[i] + down.off[i + 1] - down.off[i];
    var R = L.map(function (list) { var a = new Int32Array(list.length); for (var j = 0; j < list.length; j++) a[j] = list[j].idx; return a; });
    var crossBetween = function (k) {
      var K = R[k + 1].length + 1, n = 0, row = R[k], i, j, t;
      for (i = 0; i < row.length; i++) { var u = row[i], base = posA[u] * K; for (j = down.off[u]; j < down.off[u + 1]; j++) keyBuf[n++] = base + posA[down.idx[j]]; }
      if (n < 2) return 0;
      var keys = keyBuf.subarray(0, n); keys.sort(); fen.fill(0, 0, K + 1);
      var c = 0, done = 0, hi = K + 1;
      for (i = 0; i < n;) {
        var a = Math.floor(keys[i] / K);
        for (j = i; j < n && Math.floor(keys[j] / K) === a; j++) { var q = 0; for (t = keys[j] - a * K + 1; t > 0; t -= t & -t) q += fen[t]; c += done - q; }
        for (var m = i; m < j; m++) { for (t = keys[m] - a * K + 1; t < hi; t += t & -t) fen[t]++; done++; }
        i = j;
      }
      return c;
    };
    var total = function () { var c = 0; for (var k = 0; k + 1 < nL; k++) c += crossBetween(k); return c; };
    /* crossings among the links of a and b when a is left of b (both rows next to theirs) */
    var pairC = function (a, b, k) {
      var c = 0, p, q, x;
      if (k > 0) for (p = up.off[a]; p < up.off[a + 1]; p++) { x = posA[up.idx[p]]; for (q = up.off[b]; q < up.off[b + 1]; q++) if (x > posA[up.idx[q]]) c++; }
      if (k + 1 < nL) for (p = down.off[a]; p < down.off[a + 1]; p++) { x = posA[down.idx[p]]; for (q = down.off[b]; q < down.off[b + 1]; q++) if (x > posA[down.idx[q]]) c++; }
      return c;
    };
    var siftRow = function (k) {
      var row = R[k], n = row.length; if (n < 2) return;
      var ord = Array.prototype.slice.call(row);
      ord.sort(function (x, y) { return deg[y] - deg[x] || posA[x] - posA[y]; });
      for (var o = 0; o < n; o++) {
        var v = ord[o], from = posA[v], lo = from, hi = from, i;
        while (lo > 0 && laneA[row[lo - 1]] === laneA[v]) lo--;
        while (hi + 1 < n && laneA[row[hi + 1]] === laneA[v]) hi++;
        if (lo === hi || deg[v] === 0) continue;
        for (i = from; i > lo; i--) { row[i] = row[i - 1]; posA[row[i]] = i; }
        row[lo] = v; posA[v] = lo;
        var cur = 0, best = 0, bestAt = lo, curFrom = 0;
        for (i = lo + 1; i <= hi; i++) {
          var w = row[i];
          cur += pairC(w, v, k) - pairC(v, w, k);
          row[i - 1] = w; posA[w] = i - 1; row[i] = v; posA[v] = i;
          if (i === from) curFrom = cur;
          if (cur < best) { best = cur; bestAt = i; }
        }
        var target = best < curFrom ? bestAt : from;
        for (i = hi; i > target; i--) { row[i] = row[i - 1]; posA[row[i]] = i; }
        row[target] = v; posA[v] = target;
      }
    };
    var swaps = function (ties) {
      for (var k = 0; k < nL; k++) { var row = R[k];
        for (var i = 0; i + 1 < row.length; i++) { var a = row[i], b = row[i + 1];
          if (laneA[a] !== laneA[b]) continue;
          var c1 = pairC(a, b, k), c2 = pairC(b, a, k);
          if (c2 < c1 || (ties && c2 === c1 && c1 > 0)) { row[i] = b; row[i + 1] = a; posA[a] = i + 1; posA[b] = i; } } }
    };
    var snap = function () { return R.map(function (r) { return r.slice(); }); };
    var bestC = startC, bestR = snap(), stall = 0;
    for (var it = 0; it < rounds && bestC > 0 && stall < 2; it++) {
      if (it % 2) for (k = nL - 1; k >= 0; k--) siftRow(k); else for (k = 0; k < nL; k++) siftRow(k);
      swaps(true); swaps(false);
      var c = total();
      if (c < bestC) { bestC = c; bestR = snap(); stall = 0; } else stall++;
    }
    var byIdx = [];
    L.forEach(function (list) { list.forEach(function (v) { byIdx[v.idx] = v; }); });
    for (k = 0; k < nL; k++) { var br = bestR[k], list = L[k]; for (i = 0; i < br.length; i++) { list[i] = byIdx[br[i]]; list[i].pos = i; posA[br[i]] = i; } }
    return bestC;
  }
  function wasmPrep(nV, nL, maxLen, nLk, up, down, laneA, vert) {
    var ex = wasmEngine();
    if (!ex) return null;
    try {
      var HEAD = 65536, at = HEAD + 1024, p = {}, i, mem = ex.memory;
      var want = [['rowOff', 4 * (nL + 2)], ['ord', 4 * nV], ['best', 4 * nV], ['pos', 4 * nV], ['lane', 8 * nV], ['bary', 8 * nV], ['upOff', 4 * (nV + 1)], ['upIdx', 4 * nLk], ['dnOff', 4 * (nV + 1)], ['dnIdx', 4 * nLk],
        ['scr', 4 * (nLk + 2)], ['fen', 4 * (maxLen + 3)], ['tmp', 4 * (nV + 1)], ['upW', 8 * nLk], ['dnW', 8 * nLk], ['bothOff', 4 * (nV + 1)], ['bothIdx', 8 * nLk], ['bothW', 16 * nLk], ['cA', 8 * nV], ['gap', 8 * nV],
        ['choke', nV], ['dummy', nV], ['want', 8 * maxLen], ['wt', 8 * maxLen], ['gaps', 8 * maxLen], ['off', 8 * maxLen], ['bs', 8 * maxLen], ['bw', 8 * maxLen], ['bn', 4 * maxLen], ['out', 8 * maxLen], ['pre', 4 * nV], ['ver', 4 * (nL + 2 + nL * 20)]];
      for (i = 0; i < want.length; i++) { at = (at + 7) & ~7; p[want[i][0]] = at; at += want[i][1] + 8; }
      if (at > 1.9e9) return null;
      if (at > mem.buffer.byteLength) mem.grow(Math.ceil((at - mem.buffer.byteLength) / 65536));
      var buf = mem.buffer, w = { ex: ex, buf: buf, p: p, P: new Int32Array(buf, HEAD, WASM_LISTS.length), head: HEAD };
      w.i32 = function (n, len) { return new Int32Array(buf, p[n], len); };
      w.f64 = function (n, len) { return new Float64Array(buf, p[n], len); };
      w.i32('upOff', nV + 1).set(up.off); w.i32('upIdx', nLk).set(up.idx.subarray(0, nLk)); w.f64('upW', nLk).set(up.w.subarray(0, nLk));
      w.i32('dnOff', nV + 1).set(down.off); w.i32('dnIdx', nLk).set(down.idx.subarray(0, nLk)); w.f64('dnW', nLk).set(down.w.subarray(0, nLk));
      w.f64('lane', nV).set(laneA);
      var dm = new Uint8Array(buf, p.dummy, nV); for (i = 0; i < nV; i++) dm[i] = vert[i].dummy ? 1 : 0;
      for (i = 0; i < WASM_LISTS.length; i++) if (p[WASM_LISTS[i]] !== undefined) w.P[i] = p[WASM_LISTS[i]];
      w.P[0] = nV; w.P[1] = nL; w.P[2] = maxLen;
      return w;
    } catch (err) { WASM.error = String(err && err.message || err); return null; }
  }
  function mapPlaceLine(want, w, gaps, lo) {
    var n = want.length, off = new Array(n);
    off[0] = 0;
    for (var i = 1; i < n; i++) off[i] = off[i - 1] + gaps[i - 1];
    var blocks = [];
    for (i = 0; i < n; i++) {
      blocks.push([w[i] * (want[i] - off[i]), w[i], 1]);
      while (blocks.length > 1) {
        var b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a[0] / a[1] <= b[0] / b[1]) break;
        blocks.pop(); a[0] += b[0]; a[1] += b[1]; a[2] += b[2];
      }
    }
    var out = new Array(n), at = 0, floor = lo === undefined ? -Infinity : lo;
    for (var bi = 0; bi < blocks.length; bi++) {
      var bl = blocks[bi], val = Math.max(bl[0] / bl[1], floor);
      for (var kk = 0; kk < bl[2]; kk++, at++) out[at] = val + off[at];
      floor = -Infinity;
    }
    if (lo !== undefined && out[0] < lo) { var dd = lo - out[0]; for (var q = 0; q < n; q++) out[q] += dd; }
    for (var z = 1; z < n; z++) if (out[z] < out[z - 1] + gaps[z - 1]) out[z] = out[z - 1] + gaps[z - 1];
    return out;
  }
  /** Crossings between two neighboring layers (Fenwick tree, n log n). */
  function mapCrossPairs(segs) {
    segs.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var n = segs.length;
    if (n < 2) return 0;
    var lows = Array.from(new Set(segs.map(function (x) { return x[1]; }))).sort(function (x, y) { return x - y; });
    var idx = new Map(lows.map(function (v, i) { return [v, i + 1]; }));
    var tree = new Int32Array(lows.length + 2), c = 0, done = 0;
    for (var i = 0; i < n;) {
      var j = i;
      while (j < n && segs[j][0] === segs[i][0]) j++;
      for (var k = i; k < j; k++) {
        var q = 0;
        for (var t = idx.get(segs[k][1]); t > 0; t -= t & -t) q += tree[t];
        c += done - q;
      }
      for (k = i; k < j; k++) { for (var t2 = idx.get(segs[k][1]); t2 < tree.length; t2 += t2 & -t2) tree[t2]++; done++; }
      i = j;
    }
    return c;
  }

  /**
   * Rows in the order of the story. Links that close a loop (found depth-first from the start) are set aside, then each page goes one row
   * below the lowest page that leads to it. Pages the start cannot reach keep going below the rest, as in the shortest-route drawing.
   */
  function storyRows(G, layer, outs, opts, byNode) {
    var state = {}, backE = new Set(), order = [], reach = {};
    var dfs = function (r, isMain) {
      if (state[r]) return;
      state[r] = 1; if (isMain) reach[r] = true;
      var stack = [[r, 0]];
      while (stack.length) {
        var t = stack[stack.length - 1], list = outs[t[0]];
        if (t[1] < list.length) {
          var w = list[t[1]++];
          if (state[w] === 1) backE.add(t[0] + '>' + w);
          else if (!state[w]) { state[w] = 1; if (isMain) reach[w] = true; stack.push([w, 0]); }
        } else { state[t[0]] = 2; order.push(t[0]); stack.pop(); }
      }
    };
    if (opts.root && byNode[opts.root]) dfs(opts.root, true);
    G.nodes.forEach(function (n) { dfs(n.id, false); });
    order.reverse();
    var ins = {}, lay = {}, maxMain = -1;
    G.nodes.forEach(function (n) { ins[n.id] = []; });
    G.edges.forEach(function (e) { if (e.from !== e.to && !backE.has(e.from + '>' + e.to) && !reach[e.from] === !reach[e.to]) ins[e.to].push(e.from); });
    order.forEach(function (v) {
      var m = 0, l = ins[v];
      for (var i = 0; i < l.length; i++) if (lay[l[i]] + 1 > m) m = lay[l[i]] + 1;
      lay[v] = m;
      if (reach[v] && m > maxMain) maxMain = m;
    });
    G.nodes.forEach(function (n) { layer[n.id] = lay[n.id] + (reach[n.id] ? 0 : maxMain + 1); });
  }
  /**
   * A layered drawing of G (boxes with w and h set). opts: dir 'LR'|'TB', root (box id), spine (hold choke boxes on one line),
   * lane (box -> number), prev ({boxId: 0-1 order from last time}), gapLayer, gapNode, maxVertices.
   * Off unless asked for (the picture is then exactly the old one):
   *   rows: 'story'   rows follow the order of the story (a page sits below every page that leads to it; only real loops go back)
   *                   instead of the shortest route from the start,
   *   tagLen: N       links that span more than N rows are not drawn through the rows between; they get kind 'tag' (a tag at each end),
   *   rows: 'best'    both row choices (shortest route and story order); the one with fewer crossings is kept (a tie keeps the shortest route).
   *                   The default since 1.7.0 when rows is left out; rows: 'route' is the shortest route alone (the old default),
   *   better: true    crossing reduction with the middle value and neighbor swaps on big maps too,
   *   deep            left out (since 1.7.0): a lighter deep search (at most 12 rounds, stops after 4 with no gain); false: none (the old default);
   *   deep: true      a deeper crossing search after the usual rounds: neighbor swaps right after each row's sweep and a full swap pass, until 4 rounds
   *                   bring no gain (at most 80); never more crossings than without it; maps over 20,000 stops (boxes plus bends) skip it,
   *   sift: true     after the order search each stop slides to the place in its row with the fewest crossings (inside its lane), then neighbor swaps that take ties (2 rounds; a number: that many rounds); never more crossings,
   *   orderRounds: N  N rounds of the usual search instead of 6 (2 on maps over 600 stops; 6 more with better); 0 keeps the first order, for a caller that reorders anyway,
   *   bundle: true    links that start at the same page share one run of stops (as far as the longest goes); links that end at the same page and are
   *                   alone at their start share one run from the end upward,
   *   wrapRows: R     a tall map is cut every R rows into columns side by side (links between columns become tags),
   *   spread: 'wide'  more room for wide screens and more like a tree: siblings get more space on the sideways axis (2.4 times the gap top to bottom, 1.4 times left to right),
   *                   the space between rows is 1.7 times as wide left to right (unchanged top to bottom), and a box that leads to several boxes sits over the middle of them
   *                   instead of over their weighted average. 'tight' (or nothing) is the old picture exactly.
   */
  function layered(G, opts) {
    opts = opts || {};
    /* Left out, deep and rows mean the lighter search and both row choices (never more crossings than either alone). deep: false and
       rows: 'route' give the old default; orderRounds: 0 (the caller reorders anyway) skips both. */
    var lite = opts.deep === undefined && opts.orderRounds !== 0;
    if (opts.rows === 'best' || (opts.rows === undefined && lite)) {   // both row choices; the fewer crossings wins (a tie keeps the shortest route); the loser ran on copies, so G holds the winner
      var oA = {}, oB = {}, kk;
      for (kk in opts) { oA[kk] = opts[kk]; oB[kk] = opts[kk]; }
      oA.rows = 'route'; oB.rows = 'story';
      var RA = layered(G, oA), cp = function (o) { var c = {}; for (var k in o) c[k] = o[k]; return c; };
      var GB = { nodes: G.nodes.map(cp), edges: G.edges.map(cp) }, RB = layered(GB, oB);
      if (RB.crossings < RA.crossings) {   // the copies hold the winner: copy it onto G (running it again on G gave the same, at the cost of a third layout)
        G.nodes.forEach(function (n, i) { var c = GB.nodes[i]; for (var k in c) n[k] = c[k]; });
        G.edges.forEach(function (e, i) { var c = GB.edges[i]; for (var k in c) e[k] = c[k]; });
        var pos = {}; G.nodes.forEach(function (n) { pos[n.id] = n; });
        RB.nodes = G.nodes; RB.edges = G.edges; RB.pos = pos; RA = RB;
      }
      return RA;
    }
    var maxVertices = opts.maxVertices == null ? 90000 : opts.maxVertices;   // 0 is a real cap (refuses every nonempty graph); Infinity means no cap
    if (typeof maxVertices !== 'number' || maxVertices !== maxVertices || maxVertices < 0 || (isFinite(maxVertices) && maxVertices !== Math.floor(maxVertices))) throw new RangeError('netflow-layers: maxVertices must be a non-negative whole number (or Infinity for no cap)');
    var dir = opts.dir || 'LR', LR = dir === 'LR';
    var byNode = {}, outs = {}, ins = {};
    G.nodes.forEach(function (n) { byNode[n.id] = n; outs[n.id] = []; ins[n.id] = []; });
    G.edges.forEach(function (e) { outs[e.from].push(e.to); ins[e.to].push(e.from); });
    var layer = {}, maxL = 0;
    var bfsFrom = function (r, base, loose) {
      if (layer[r] !== undefined) return;
      layer[r] = base; byNode[r].loose = loose;
      var q = [r];
      for (var i = 0; i < q.length; i++) {
        var outl = outs[q[i]];
        for (var j = 0; j < outl.length; j++) {
          var w = outl[j];
          if (layer[w] === undefined) { layer[w] = layer[q[i]] + 1; byNode[w].loose = loose; q.push(w); }
        }
      }
      q.forEach(function (id) { if (layer[id] > maxL) maxL = layer[id]; });
    };
    if (opts.root && byNode[opts.root]) bfsFrom(opts.root, 0, false);
    G.nodes.forEach(function (n) {
      if (layer[n.id] === undefined && !ins[n.id].some(function (f) { return layer[f] === undefined && f !== n.id; })) bfsFrom(n.id, maxL + 1, true);
    });
    G.nodes.forEach(function (n) { if (layer[n.id] === undefined) bfsFrom(n.id, maxL + 1, true); });
    var tagLen = opts.tagLen > 1 ? opts.tagLen : 0, wrapR = opts.wrapRows > 1 && !opts.lane ? Math.floor(opts.wrapRows) : 0;
    /* a link is drawn as a pair of tags when it is very long, or (when a tall map is wrapped into columns) when it leaves its column */
    var tagged = function (la, lb) { return (tagLen && Math.abs(lb - la) > tagLen) || (wrapR && Math.floor(la / wrapR) !== Math.floor(lb / wrapR)); };
    if (opts.rows === 'story') { storyRows(G, layer, outs, opts, byNode); maxL = 0; for (var idr in layer) if (layer[idr] > maxL) maxL = layer[idr]; }
    var dummies = 0;
    /* bundling: links (forward or back) that start from the same page at the top share one run of stand-in stops, as far as the longest of
       them goes; links that end at the same page at the bottom and are alone at their top share one run from the bottom upward.
       Flat and tagged links are left alone. */
    var topOf = function (e) { return layer[e.to] > layer[e.from] ? e.from : e.to; }, botOf = function (e) { return layer[e.to] > layer[e.from] ? e.to : e.from; };
    var bundle = opts.bundle ? (function () {
      var byTop = {}, byBot = {}, mode = new Array(G.edges.length);
      var usable = function (e) { var la = layer[e.from], lb = layer[e.to]; return e.from !== e.to && Math.abs(lb - la) >= 2 && !tagged(la, lb); };
      G.edges.forEach(function (e, i) { if (usable(e)) (byTop[topOf(e)] || (byTop[topOf(e)] = [])).push(i); });
      Object.keys(byTop).forEach(function (f) { if (byTop[f].length > 1) byTop[f].forEach(function (i) { mode[i] = 'top'; }); });
      G.edges.forEach(function (e, i) { if (usable(e) && !mode[i]) (byBot[botOf(e)] || (byBot[botOf(e)] = [])).push(i); });
      Object.keys(byBot).forEach(function (t) { if (byBot[t].length > 1) byBot[t].forEach(function (i) { mode[i] = 'bot'; }); });
      return { mode: mode, topTrunk: {}, botTrunk: {} };
    })() : null;
    if (bundle) {
      var need = {}, count = 0;
      G.edges.forEach(function (e, i) {
        var s0 = Math.abs(layer[e.to] - layer[e.from]) - 1, m = bundle.mode[i];
        if (e.from === e.to || tagged(layer[e.from], layer[e.to]) || s0 < 1) return;
        if (m === 'top') { var ks = 't' + topOf(e); need[ks] = Math.max(need[ks] || 0, s0); }
        else if (m === 'bot') { var kb = 'b' + botOf(e); need[kb] = Math.max(need[kb] || 0, s0); }
        else count += s0;
      });
      for (var nk in need) count += need[nk];
      dummies = count;
    } else G.edges.forEach(function (e) { var s = Math.abs(layer[e.to] - layer[e.from]); if (tagged(layer[e.from], layer[e.to])) return; if (s > 1) dummies += s - 1; });
    if (dummies + G.nodes.length > maxVertices) {
      var err = new Error('too big for a layered drawing (' + (dummies + G.nodes.length) + ' stops); use the Network view or filter first');
      err.tooBig = true;
      throw err;
    }
    var L = [], vert = [];
    var addV = function (rec, k) { rec.layer = k; rec.idx = vert.length; vert.push(rec); (L[k] = L[k] || []).push(rec); return rec; };
    /* a box's own stop and a link's run of stand-in stops are kept in side lists (not as fields of the caller's objects, which would have to be deleted again: deleting a field makes every object slow) */
    var nodeIx = {}, chains = new Array(G.edges.length);
    G.nodes.forEach(function (n, ni) { nodeIx[n.id] = ni; addV({ id: n.id, node: n, dummy: false }, layer[n.id]); });
    var lkA = [], lkB = [], lkW = [];   // the stand-in links, three lists side by side (from, to, weight)
    var addLink = function (a, b, w) { lkA.push(a.idx); lkB.push(b.idx); lkW.push(w); };   // stop numbers, not the stops
    G.edges.forEach(function (e, ei0) {
      var a = vert[nodeIx[e.from]], b = vert[nodeIx[e.to]], la = layer[e.from], lb = layer[e.to], chain = chains[ei0] = [];
      if (e.from === e.to) { e.kind = 'self'; return; }
      if (la === lb) { e.kind = 'flat'; return; }
      if (tagged(la, lb)) { e.kind = 'tag'; e.tagFwd = lb > la; return; }
      e.kind = lb > la ? 'fwd' : 'back';
      var bm = bundle ? bundle.mode[ei0] : null;
      if (bm) {
        var tid = topOf(e), bid = botOf(e), tv = vert[nodeIx[tid]], bv = vert[nodeIx[bid]], lt = Math.min(la, lb), lbm = Math.max(la, lb), nd = lbm - lt - 1, part;
        if (bm === 'top') {
          var tr = bundle.topTrunk[tid] || (bundle.topTrunk[tid] = []);
          while (tr.length < nd) { var dd = addV({ dummy: true, edge: e }, lt + 1 + tr.length); addLink(tr.length ? tr[tr.length - 1] : tv, dd, tr.length ? 8 : 2); tr.push(dd); }
          part = tr.slice(0, nd); addLink(tr[nd - 1], bv, 2);
        } else {
          var tb = bundle.botTrunk[bid] || (bundle.botTrunk[bid] = []);
          while (tb.length < nd) { var d3 = addV({ dummy: true, edge: e }, lbm - 1 - tb.length); addLink(d3, tb.length ? tb[tb.length - 1] : bv, tb.length ? 8 : 2); tb.push(d3); }
          part = tb.slice(0, nd).reverse(); addLink(tv, tb[nd - 1], 2);
        }
        chains[ei0] = lb > la ? part : part.reverse();
        return;
      }
      var lo = Math.min(la, lb), hi = Math.max(la, lb), prevV = lb > la ? a : b;
      for (var k = lo + 1; k < hi; k++) {
        var d = addV({ dummy: true, edge: e }, k);
        chain.push(d); addLink(prevV, d, prevV.dummy ? 8 : 2); prevV = d;
      }
      addLink(prevV, lb > la ? b : a, prevV.dummy ? 2 : 1);
      if (e.kind === 'back') chain.reverse();
    });
    /* the neighbors of every stop, as flat lists: neighbors of stop i are idx[off[i] .. off[i + 1] - 1] with weights w[...], in the order the links were made */
    var nV = vert.length, nLk = lkA.length;
    var csr = function (from, to) {
      var off = new Int32Array(nV + 1), idx = new Int32Array(nLk), w = new Float64Array(nLk), i, f;
      for (i = 0; i < nLk; i++) off[from[i] + 1]++;
      for (i = 0; i < nV; i++) off[i + 1] += off[i];
      var fill = off.slice(0, nV);
      for (i = 0; i < nLk; i++) { f = from[i]; idx[fill[f]] = to[i]; w[fill[f]++] = lkW[i]; }
      return { off: off, idx: idx, w: w };
    };
    var up = csr(lkB, lkA), down = csr(lkA, lkB);
    var nL = L.length;
    for (var k0 = 0; k0 < nL; k0++) L[k0] = L[k0] || [];
    /* depth-first rank without recursion */
    var dfsRank = {}, rank = 0, seenD = new Set();
    var visitFrom = function (r) {
      if (seenD.has(r)) return;
      var stack = [[r, 0]];
      seenD.add(r); dfsRank[r] = rank++;
      while (stack.length) {
        var top = stack[stack.length - 1], list = outs[top[0]];
        if (top[1] < list.length) {
          var w = list[top[1]++];
          if (!seenD.has(w)) { seenD.add(w); dfsRank[w] = rank++; stack.push([w, 0]); }
        } else stack.pop();
      }
    };
    if (opts.root && byNode[opts.root]) visitFrom(opts.root);
    G.nodes.forEach(function (n) { visitFrom(n.id); });
    var prev = opts.prev || {};
    var laneOfEdge = function (e) { return Math.min(opts.lane(byNode[e.from]), opts.lane(byNode[e.to])); };
    var laneOf = function (v) { return v.dummy ? (opts.lane ? laneOfEdge(v.edge) : 0) : opts.lane ? opts.lane(v.node) : 0; };
    var rn = Math.max(1, rank);
    L.forEach(function (list) {
      list.forEach(function (v) {
        v.key = v.dummy ? (dfsRank[v.edge.from] + dfsRank[v.edge.to]) / 2 / rn : (prev[v.id] !== undefined ? prev[v.id] : dfsRank[v.id] / rn);
      });
    });
    /* place in its row, lane and average neighbor place of every stop in flat lists by stop number (v.pos is kept in step for the code after the rows are final) */
    var posA = new Int32Array(nV), laneA = new Float64Array(nV), baryA = new Float64Array(nV);
    vert.forEach(function (v) { laneA[v.idx] = laneOf(v); });
    L.forEach(function (list) {
      list.sort(opts.lane ? function (a, b) { return laneA[a.idx] - laneA[b.idx] || a.key - b.key; } : function (a, b) { return a.key - b.key; });   // no lanes: every lane is 0
      list.forEach(function (v, i) { v.pos = i; posA[v.idx] = i; });
    });
    /* crossings between row k and row k+1 on flat number lists (the same count as mapCrossPairs gives): each link is one number, upper place * K + lower place, sorted as numbers */
    var maxSeg = 0, maxLen = 0;
    L.forEach(function (list) { var m = 0; list.forEach(function (u) { m += down.off[u.idx + 1] - down.off[u.idx]; }); if (m > maxSeg) maxSeg = m; if (list.length > maxLen) maxLen = list.length; });
    var siftN = opts.sift === true ? 2 : typeof opts.sift === 'number' && opts.sift > 0 ? Math.floor(opts.sift) : 0;
    var wm = WASM.on && nV >= WASM.min ? wasmPrep(nV, nL, maxLen, nLk, up, down, laneA, vert) : null, best, bestC = 0;
    var big = vert.length > 600, baseRounds = big ? 2 : 6, dMax = opts.deep === true ? DEEP.max : lite ? DEEP.liteMax : 0, dStall = opts.deep === true ? DEEP.stall : DEEP.liteStall, deepOn = dMax > 0 && vert.length <= DEEP.maxStops;
    var nRounds = typeof opts.orderRounds === 'number' && opts.orderRounds >= 0 ? Math.floor(opts.orderRounds) : baseRounds + (opts.better ? 6 : 0);   // orderRounds: 0 for a caller that reorders anyway
    if (wm) {   // the whole order search in WebAssembly (wasm/order.c, order); L and posA are written only when it has finished
      try {
        var wP = wm.P, wro = wm.i32('rowOff', nL + 2), wod = wm.i32('ord', nV), r0 = 0, wi, wk;
        for (wk = 0; wk < nL; wk++) { wro[wk] = r0; for (wi = 0; wi < L[wk].length; wi++) wod[r0 + wi] = L[wk][wi].idx; r0 += L[wk].length; }
        wro[nL] = r0; wro[nL + 1] = r0;
        wm.i32('pos', nV).set(posA);
        wP[3] = baseRounds; wP[4] = nRounds; wP[5] = big ? 1 : 0;
        wP[WASM_LISTS.indexOf('DEEPMAX')] = deepOn ? dMax : 0; wP[WASM_LISTS.indexOf('DEEPSTALL')] = dStall; wP[WASM_LISTS.indexOf('DEEPTG')] = DEEP.tg;
        bestC = wm.ex.order(wm.head);
        if (siftN && bestC > 0 && nL > 1) { bestC = wm.ex.sift(wm.head, bestC, siftN); SIFT.calls++; }
        var wbo = wm.i32('best', nV), rows = new Array(nL);
        for (wk = 0; wk < nL; wk++) { var wl = rows[wk] = new Array(L[wk].length); for (wi = 0; wi < wl.length; wi++) wl[wi] = vert[wbo[wro[wk] + wi]]; }
        for (wk = 0; wk < nL; wk++) { L[wk] = rows[wk]; rows[wk].forEach(function (v, i) { v.pos = i; posA[v.idx] = i; }); }
        WASM.calls++;
      } catch (err) { WASM.error = String(err && err.message || err); wm = null; }
    }
    if (!wm) {
      var keyBuf = new Float64Array(maxSeg), fen = new Int32Array(maxLen + 2);
      var crossBetween = function (k) {
        var K = L[k + 1].length + 1, n = 0, list = L[k], i, j, t;
        for (i = 0; i < list.length; i++) { var u = list[i], base = posA[u.idx] * K; for (j = down.off[u.idx]; j < down.off[u.idx + 1]; j++) keyBuf[n++] = base + posA[down.idx[j]]; }
        if (n < 2) return 0;
        var keys = keyBuf.subarray(0, n); keys.sort();
        fen.fill(0, 0, K + 1);
        var c = 0, done = 0, hi = K + 1;
        for (i = 0; i < n;) {
          var a = Math.floor(keys[i] / K);
          for (j = i; j < n && Math.floor(keys[j] / K) === a; j++) {
            var q = 0;
            for (t = keys[j] - a * K + 1; t > 0; t -= t & -t) q += fen[t];
            c += done - q;
          }
          for (var m = i; m < j; m++) { for (t = keys[m] - a * K + 1; t < hi; t += t & -t) fen[t]++; done++; }
          i = j;
        }
        return c;
      };
      var totalCross = function () { var c = 0; for (var k = 0; k + 1 < nL; k++) c += crossBetween(k); return c; };
      var snapshot = function (from) { return (from || L).map(function (list) { return list.slice(); }); };
      var two = deepOn && nRounds > baseRounds, preBest = null, preC = -1;
      var best = snapshot(), bestC = totalCross();
      var medianNow = false;
      var scratch = new Int32Array(Math.max(1, nLk));   // for the middle value of a stop's neighbor places
      var sweep = function (k, nb) {
        var list = L[k], i, j, lo, hi;
        for (i = 0; i < list.length; i++) {
          var v = list[i], a = nb.off[v.idx], z = nb.off[v.idx + 1], cnt = z - a;
          if (medianNow && cnt) {
            for (j = 0; j < cnt; j++) { var pv = posA[nb.idx[a + j]], q = j - 1; while (q >= 0 && scratch[q] > pv) { scratch[q + 1] = scratch[q]; q--; } scratch[q + 1] = pv; }
            var mid = cnt >> 1; baryA[v.idx] = cnt % 2 ? scratch[mid] : (scratch[mid - 1] + scratch[mid]) / 2;
          } else if (cnt) { var sum = 0; for (j = a; j < z; j++) sum += posA[nb.idx[j]]; baryA[v.idx] = sum / cnt; }
          else baryA[v.idx] = posA[v.idx];
        }
        list.sort(function (a, b) { return laneA[a.idx] - laneA[b.idx] || baryA[a.idx] - baryA[b.idx] || posA[a.idx] - posA[b.idx]; });
        for (i = 0; i < list.length; i++) { list[i].pos = i; posA[list[i].idx] = i; }
      };
      var tgMax = 8;
      var transpose = function (k) {
        var improved = true, guard = 0, before, after;
        var tally = function (ax, bx, nb) {
          for (var p = nb.off[ax]; p < nb.off[ax + 1]; p++) for (var q = nb.off[bx]; q < nb.off[bx + 1]; q++) {
            var x = posA[nb.idx[p]], y = posA[nb.idx[q]];
            if (x > y) before++; else if (x < y) after++;
          }
        };
        while (improved && guard++ < tgMax) {
          improved = false;
          for (var i = 0; i + 1 < L[k].length; i++) {
            var a = L[k][i], b = L[k][i + 1];
            if (laneA[a.idx] !== laneA[b.idx]) continue;
            before = 0; after = 0;
            if (k + 1 < nL) tally(a.idx, b.idx, down);
            if (k > 0) tally(a.idx, b.idx, up);
            if (after < before) { a.pos = i + 1; b.pos = i; posA[a.idx] = i + 1; posA[b.idx] = i; L[k][i] = b; L[k][i + 1] = a; improved = true; }
          }
        }
      };
      /* "better": after the usual rounds, six more (average and middle value in turn, neighbor swaps always); the best order seen is kept, so it is never worse */
      for (var it = 0; it < nRounds && bestC > 0; it++) {
        medianNow = it >= baseRounds && (it - baseRounds) % 2 === 1;
        for (var k1 = 1; k1 < nL; k1++) sweep(k1, up);
        for (var k2 = nL - 2; k2 >= 0; k2--) sweep(k2, down);
        if (!big || it >= baseRounds) for (var k3 = 0; k3 < nL; k3++) transpose(k3);
        var c = totalCross();
        if (c < bestC) { bestC = c; best = snapshot(); }
        if (two && it === baseRounds - 1) { preBest = snapshot(best); preC = bestC; }
      }
      /* "deep": from the best order so far, rounds with neighbor swaps right after each row's sweep and a full swap pass (up to 50 passes a row);
         it stops after DEEP.stall rounds with no gain or DEEP.max rounds; the best order seen is kept, so it is never worse */
      /* when rounds ran past the usual ones ("better"), the deep search also starts from the best order of the usual rounds and the fewer crossings win,
         so the extra rounds never end in more crossings (the same rule as wasm/order.c) */
      var deepFrom = function (start, startC) {
        start.forEach(function (list, k) { L[k] = list.slice(); L[k].forEach(function (v, i) { v.pos = i; posA[v.idx] = i; }); });
        var bC = startC, bS = start;
        tgMax = DEEP.tg;
        for (var d1 = 0, stall = 0; d1 < dMax && bC > 0 && stall < dStall; d1++) {
          medianNow = d1 % 2 === 1;
          for (var k4 = 1; k4 < nL; k4++) { sweep(k4, up); transpose(k4); }
          for (var k5 = nL - 2; k5 >= 0; k5--) { sweep(k5, down); transpose(k5); }
          for (var k6 = 0; k6 < nL; k6++) transpose(k6);
          var c3 = totalCross();
          if (c3 < bC) { bC = c3; bS = snapshot(); stall = 0; } else stall++;
        }
        tgMax = 8; return [bS, bC];
      };
      if (deepOn && bestC > 0) {
        var rA = deepFrom(best, bestC);
        if (two && preC > 0) { var rB = deepFrom(preBest, preC); if (rB[1] < rA[1]) rA = rB; }
        best = rA[0]; bestC = rA[1];
      }
      best.forEach(function (list, k) { L[k] = list; list.forEach(function (v, i) { v.pos = i; posA[v.idx] = i; }); });
    }
    /* sift (opt-in): after the order search, each stop slides through every place in its row (only inside its lane) to the place with the fewest
       crossings, most-linked stops first, rows top-down then bottom-up in turn; then one neighbor-swap pass that takes ties and one strict pass.
       The best order seen is kept, so it never ends with more crossings. Same steps as sift() in wasm/order.c. */
    if (!wm && siftN && bestC > 0 && nL > 1) { var SR = siftRows(L, posA, laneA, up, down, nV, nL, maxLen, maxSeg, bestC, siftN); bestC = SR; SIFT.calls++; }
    var across = function (v) { return v.dummy ? 0 : LR ? v.node.h : v.node.w; };
    var wide = opts.spread === 'wide', gapN = (opts.gapNode !== undefined ? opts.gapNode : LR ? 22 : 28) * (wide ? (LR ? 1.4 : 2.4) : 1), gapD = 12 * (wide ? (LR ? 1.3 : 2) : 1);
    var gapOf = function (a, b) { return (across(a) + across(b)) / 2 + (a.dummy || b.dummy ? gapD : gapN) + (opts.lane && laneOf(a) !== laneOf(b) ? 40 : 0); };
    /* the place of every stop and the gap before it live in flat lists by stop number; the gap before a stop never changes once the rows are final */
    var cA = new Float64Array(nV), gapBefore = new Float64Array(nV), chokeA = new Uint8Array(nV);
    L.forEach(function (list) {
      var c2 = 0;
      list.forEach(function (v, i) { if (i) { gapBefore[v.idx] = gapOf(list[i - 1], v); c2 += gapBefore[v.idx]; } cA[v.idx] = c2; });
    });
    vert.forEach(function (v) { if (!v.dummy && opts.spine && v.node.choke) chokeA[v.idx] = 1; });
    var placedW = false;
    if (wm) {   // the row placement in WebAssembly (wasm/order.c, place); cA is written only when it has finished
      try {
        var q = wm.P, qro = wm.i32('rowOff', nL + 2), qod = wm.i32('best', nV), r1 = 0, qi, qk;
        for (qk = 0; qk < nL; qk++) { qro[qk] = r1; for (qi = 0; qi < L[qk].length; qi++) qod[r1 + qi] = L[qk][qi].idx; r1 += L[qk].length; }
        qro[qk] = r1; qro[qk + 1] = r1;
        q[WASM_LISTS.indexOf('ord')] = wm.p.best;
        wm.f64('cA', nV).set(cA); wm.f64('gap', nV).set(gapBefore); new Uint8Array(wm.buf, wm.p.choke, nV).set(chokeA);
        q[WASM_LISTS.indexOf('WIDE')] = wide ? 1 : 0; q[WASM_LISTS.indexOf('ITERS')] = big ? 3 : 8;
        wm.ex.place(wm.head);
        cA.set(wm.f64('cA', nV));
        placedW = true; WASM.calls++;
      } catch (err) { WASM.error = String(err && err.message || err); }
    }
    if (!placedW) {
      /* the row placement on flat number lists: the same arithmetic as mapPlaceLine, in the same order, with no list made per row */
      var P = { want: new Float64Array(maxLen), wt: new Float64Array(maxLen), gaps: new Float64Array(maxLen), off: new Float64Array(maxLen), bs: new Float64Array(maxLen), bw: new Float64Array(maxLen), bn: new Int32Array(maxLen), out: new Float64Array(maxLen) };
      var placeLayer = function (list, nb) {
        var n = list.length, want = P.want, wt = P.wt, gaps = P.gaps, off = P.off, bs = P.bs, bw = P.bw, bn = P.bn, out = P.out, nbOff = nb.off, nbIdx = nb.idx, nbW = nb.w, i, j;
        if (!n) return;
        for (i = 0; i < n; i++) {
          var v = list[i], vi = v.idx, na = nbOff[vi], nz = nbOff[vi + 1], s = 0, sw = 0;
          for (j = na; j < nz; j++) { s += cA[nbIdx[j]] * nbW[j]; sw += nbW[j]; }
          if (chokeA[vi]) { want[i] = 0; wt[i] = 1000; }
          else {
            var mid = sw ? s / sw : cA[vi];
            if (wide && sw && !v.dummy && nz - na > 1) { var lo = Infinity, hi = -Infinity; for (j = na; j < nz; j++) { lo = Math.min(lo, cA[nbIdx[j]]); hi = Math.max(hi, cA[nbIdx[j]]); } mid = (lo + hi) / 2; }   // wide: over the middle of its neighbors, like a tree
            want[i] = mid; wt[i] = sw ? sw + (v.dummy ? 2 : 0) : 0.2;
          }
          if (i) gaps[i - 1] = gapBefore[vi];
        }
        off[0] = 0;
        for (i = 1; i < n; i++) off[i] = off[i - 1] + gaps[i - 1];
        var m = 0;
        for (i = 0; i < n; i++) {
          bs[m] = wt[i] * (want[i] - off[i]); bw[m] = wt[i]; bn[m] = 1; m++;
          while (m > 1 && bs[m - 2] / bw[m - 2] > bs[m - 1] / bw[m - 1]) { m--; bs[m - 1] += bs[m]; bw[m - 1] += bw[m]; bn[m - 1] += bn[m]; }
        }
        var at = 0;
        for (var bi = 0; bi < m; bi++) { var val = bs[bi] / bw[bi]; for (var kk = 0; kk < bn[bi]; kk++, at++) out[at] = val + off[at]; }
        for (i = 1; i < n; i++) if (out[i] < out[i - 1] + gaps[i - 1]) out[i] = out[i - 1] + gaps[i - 1];
        for (i = 0; i < n; i++) cA[list[i].idx] = out[i];
      };
      var both = (function () {   // up neighbors first, then down neighbors, for each stop
        var off = new Int32Array(nV + 1), idx = new Int32Array(2 * nLk), w = new Float64Array(2 * nLk), at = 0, i, j;
        for (i = 0; i < nV; i++) {
          off[i] = at;
          for (j = up.off[i]; j < up.off[i + 1]; j++) { idx[at] = up.idx[j]; w[at++] = up.w[j]; }
          for (j = down.off[i]; j < down.off[i + 1]; j++) { idx[at] = down.idx[j]; w[at++] = down.w[j]; }
        }
        off[nV] = at;
        return { off: off, idx: idx, w: w };
      })();
      for (var it2 = 0; it2 < (big ? 3 : 8); it2++) {
        for (var k4 = 1; k4 < nL; k4++) placeLayer(L[k4], it2 % 3 === 2 ? both : up);
        for (var k5 = nL - 2; k5 >= 0; k5--) placeLayer(L[k5], it2 % 3 === 2 ? both : down);
      }
    }
    vert.forEach(function (v) { v.c = cA[v.idx]; });
    var lanes = [];
    if (opts.lane) {
      var ext = {};
      vert.forEach(function (v) {
        var ln = laneOf(v), lo = v.c - across(v) / 2, hi = v.c + across(v) / 2;
        ext[ln] = ext[ln] ? [Math.min(ext[ln][0], lo), Math.max(ext[ln][1], hi)] : [lo, hi];
      });
      var order = Object.keys(ext).map(Number).sort(function (a, b) { return a - b; }), shift = {}, at = 0;
      order.forEach(function (ln) {
        shift[ln] = at - ext[ln][0] + 28;
        lanes.push({ lane: ln, from: at, to: at + (ext[ln][1] - ext[ln][0]) + 56 });
        at += ext[ln][1] - ext[ln][0] + 56 + 16;
      });
      vert.forEach(function (v) { v.c += shift[laneOf(v)]; });
    }
    var gapL = (opts.gapLayer !== undefined ? opts.gapLayer : LR ? 80 : 64) * (wide && LR ? 1.7 : 1), depthOf = [], at2 = 0;
    for (var k6 = 0; k6 < nL; k6++) {
      var mm = 0;
      L[k6].forEach(function (v) { if (!v.dummy) mm = Math.max(mm, LR ? v.node.w : v.node.h); });
      depthOf[k6] = [at2, mm || 20];
      at2 += (mm || 20) + gapL;
    }
    var minC = Infinity, band = function (v) { return wrapR ? Math.floor(v.layer / wrapR) : 0; }, nb = wrapR ? Math.floor((nL - 1) / wrapR) + 1 : 1;
    var bLo = [], bHi = [], bAt = [];
    vert.forEach(function (v) {
      var lo = v.c - across(v) / 2, hi = v.c + across(v) / 2, b = band(v);
      minC = Math.min(minC, lo);
      if (bLo[b] === undefined || lo < bLo[b]) bLo[b] = lo;
      if (bHi[b] === undefined || hi > bHi[b]) bHi[b] = hi;
    });
    if (!isFinite(minC)) minC = 0;
    var pad = 20, bX = [], bY = [], gapB = 90, run = 0;
    for (var bb = 0; bb < nb; bb++) {
      bY[bb] = wrapR ? depthOf[bb * wrapR][0] : 0;
      bX[bb] = wrapR && bLo[bb] !== undefined ? run - bLo[bb] + minC : 0;   /* shift so this column starts right after the one before */
      if (wrapR && bLo[bb] !== undefined) run += bHi[bb] - bLo[bb] + gapB;
    }
    vert.forEach(function (v) {
      var b = band(v), dm = depthOf[v.layer], along = dm[0] + dm[1] / 2 - bY[b], acrossC = v.c - minC + bX[b];
      if (v.dummy) { v.x = LR ? pad + along : pad + acrossC; v.y = LR ? pad + acrossC : pad + along; return; }
      var n = v.node;
      n.layer = v.layer;
      n.x = LR ? pad + along - n.w / 2 : pad + acrossC - n.w / 2;
      n.y = LR ? pad + acrossC - n.h / 2 : pad + along - n.h / 2;
    });
    lanes = lanes.map(function (l) { return { lane: l.lane, from: pad + l.from - minC, to: pad + l.to - minC }; });
    G.edges.forEach(function (e, ei) { e.pts = chains[ei].map(function (v) { return [v.x, v.y]; }); });
    var W = 0, H = 0;
    G.nodes.forEach(function (n) { W = Math.max(W, n.x + n.w); H = Math.max(H, n.y + n.h); });
    vert.forEach(function (v) { if (v.dummy) { W = Math.max(W, v.x); H = Math.max(H, v.y); } });
    if (lanes.length) { if (LR) H = Math.max(H, lanes[lanes.length - 1].to); else W = Math.max(W, lanes[lanes.length - 1].to); }
    var ord = {};
    L.forEach(function (list) { list.forEach(function (v) { if (!v.dummy) ord[v.id] = (v.pos + 0.5) / list.length; }); });
    var pos = {};
    G.nodes.forEach(function (n) { pos[n.id] = n; });
    var ruler = depthOf.map(function (dm, k) { var b = wrapR ? Math.floor(k / wrapR) : 0; return { at: pad + dm[0] + dm[1] / 2 - bY[b], edge: pad + (wrapR && bLo[b] !== undefined ? bLo[b] - minC + bX[b] : 0) }; });
    var kinds = { fwd: 0, back: 0, flat: 0, self: 0, tag: 0 };
    var goldTags = 0;
    G.edges.forEach(function (e) { kinds[e.kind]++; if (e.kind === 'tag' && !e.tagFwd) goldTags++; });
    return { kind: 'nodes', dir: dir, nodes: G.nodes, edges: G.edges, pos: pos, order: ord, lanes: lanes, width: W + pad + 60, height: H + pad + 30, crossings: bestC,
      rows: depthOf, ruler: ruler, info: { columns: nb, rows: nL, stops: vert.length - G.nodes.length, back: kinds.back, flat: kinds.flat, tags: kinds.tag, goldTags: goldTags, rowMode: opts.rows === 'story' ? 'story' : 'route' } };
  }


  /** Counts of what the drawing needed, used by layout() for the wrap rule. */
  function layout(graph, opts) {
    opts = opts || {};
    var nodes = graph.nodes.map(function (n) { var c = {}; for (var k in n) c[k] = n[k]; return c; });
    var edges = graph.edges.map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; if (c.count === undefined) c.count = 1; return c; });
    var G = { nodes: nodes, edges: edges };
    var base = { dir: opts.dir === 'TB' ? 'TB' : 'LR', root: graph.root, prev: opts.prev, spine: !!opts.spine, rows: opts.rows === 'story' || opts.rows === 'best' || opts.rows === 'route' ? opts.rows : undefined, tagLen: opts.tagLen > 1 ? opts.tagLen : 0, better: !!opts.better, bundle: !!opts.bundle };
    if (opts.deep === true || opts.deep === false) base.deep = opts.deep;
    if (opts.orderRounds !== undefined) base.orderRounds = opts.orderRounds;
    if (opts.sift !== undefined) base.sift = opts.sift;
    if (opts.spread === 'wide') base.spread = 'wide';
    if (opts.gapNode !== undefined) base.gapNode = opts.gapNode;
    if (opts.gapLayer !== undefined) base.gapLayer = opts.gapLayer;
    if (opts.maxVertices !== undefined) base.maxVertices = opts.maxVertices;
    var laned = opts.lanes && nodes.some(function (n) { return n.lane !== undefined; });
    if (laned) base.lane = function (n) { return Math.max(0, n.lane | 0); };
    var R = layered(G, base);
    if (opts.wrap && base.dir === 'TB' && !laned && R.height > 2.2 * R.width) {
      var K = Math.round(Math.sqrt(1.6 * R.height / R.width)), rows = Math.ceil(R.info.rows / Math.max(1, K));
      if (K >= 2 && rows >= 2 && rows < R.info.rows) { var o2 = {}; for (var k in base) o2[k] = base[k]; o2.wrapRows = rows; R = layered(G, o2); }
    }
    return R;
  }

  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var f1 = function (x) { return Math.round(x * 10) / 10; };
  /** A plain SVG picture of a layout() result: boxes, curved links through the stops, tags with name chips. Options: gold, line, box, boxLine, text, muted (colors), taper (forward links as shapes that narrow from 5 to 1 px). */
  /** The links of any plain input: a list of { from, to, value } (weight or count also name the amount; 1 when none), or { links } or { edges }. */
  /* Table rows in your own column names work too: name them with o.from, o.to and o.value, or leave them out and the first two text columns and the first number column are used. */
  function asLinks(d, o) {
    o = o || {}; var l = Array.isArray(d) ? d : (d && (d.links || d.edges)) || [], r0 = l[0] || {}, F = typeof o.from === 'string' ? o.from : null, T = typeof o.to === 'string' ? o.to : null, V = typeof o.value === 'string' ? o.value : null;
    if (!F && !T && r0.from === undefined && r0.to === undefined) { var txt = [], num = null; Object.keys(r0).forEach(function (k) { var v = r0[k]; if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && isFinite(+v))) { if (num === null) num = k; } else if (typeof v === 'string') txt.push(k); }); F = txt[0] || null; T = txt[1] || null; if (!V) V = num; }
    return l.map(function (e) { var v = V ? e[V] : e.value !== undefined ? e.value : e.weight !== undefined ? e.weight : e.count !== undefined ? e.count : 1; return { from: F ? e[F] : e.from, to: T ? e[T] : e.to, value: v === undefined || v === '' ? 1 : +v }; });
  }
  /** toSvg(data, o) in one call (links as above, or { nodes, edges } with or without sizes), or toSvg(R, o) for a layout result (its nodes have x and y). */
  function toSvg(R, o) {
    o = o || {};
    if (!R || !R.nodes || !R.nodes.length || R.nodes[0].x === undefined || R.width === undefined) {
      var ls = asLinks(R, o), ns = R && !Array.isArray(R) && R.nodes ? R.nodes.slice() : [], seen = {};
      ns.forEach(function (n) { seen[n.id] = 1; }); ls.forEach(function (e) { [e.from, e.to].forEach(function (id) { if (!seen[id]) { seen[id] = 1; ns.push({ id: id }); } }); });
      ns = ns.map(function (n) { var c = {}; for (var k in n) c[k] = n[k]; var t = String(c.label !== undefined ? c.label : c.id); if (!(c.w > 0)) c.w = Math.max(60, t.length * 7.2 + 24); if (!(c.h > 0)) c.h = 32; return c; });
      R = layout({ root: R && R.root !== undefined ? R.root : (ns[0] && ns[0].id), nodes: ns, edges: ls.map(function (e) { return { from: e.from, to: e.to, count: e.value }; }) }, o);
    }
    var gold = o.gold || '#9a6a00', line = o.line || '#6b7a90', box = o.box || '#eaf0f8', boxLine = o.boxLine || '#44546a', ink = o.text || '#222', muted = o.muted || '#667', LR = R.dir !== 'TB', out = [];
    /* optional highlight (o.highlight, an id or a label): that box and every link touching it keep their colors, the rest fade toward the background (names stay readable) */
    var hl = null, near = {}, bgc = o.background || '#ffffff';
    if (o.highlight !== undefined && o.highlight !== null) R.nodes.forEach(function (n) { if (hl === null && (String(n.id) === String(o.highlight) || (n.label !== undefined && String(n.label) === String(o.highlight)))) hl = n.id; });
    if (hl !== null) { near[hl] = 1; R.edges.forEach(function (e) { if (e.from === hl) near[e.to] = 1; if (e.to === hl) near[e.from] = 1; }); }
    var fade = function (c) { var m = /^#([0-9a-f]{6})$/i.exec(c), b = /^#([0-9a-f]{6})$/i.exec(bgc); if (!m || !b) return c; var x = parseInt(m[1], 16), y = parseInt(b[1], 16), h = function (sh) { var u = (x >> sh) & 255, v = (y >> sh) & 255; return Math.round(u + (v - u) * 0.6); }; return '#' + ((1 << 24) | (h(16) << 16) | (h(8) << 8) | h(0)).toString(16).slice(1); };
    var hot = function (e) { return hl === null || e.from === hl || e.to === hl; };
    var name = function (n) { return esc(n.label !== undefined ? n.label : n.id); }, cx = function (n) { return n.x + n.w / 2; }, cy = function (n) { return n.y + n.h / 2; };
    /* optional title block (o.title, o.subtitle, o.source), drawn like the Sankey, plot and treemap ones: bold title and lighter subtitle above, small source below; the chart itself is moved down inside a group and does not change */
    var pad = 14, head = 0, foot = 0, blk = '', ty = pad;
    if (o.title) { ty += 20; blk += '<text x="' + pad + '" y="' + ty + '" font-size="20" font-weight="700" fill="' + esc(ink) + '">' + esc(o.title) + '</text>'; ty += 6; }
    if (o.subtitle) { ty += 13; blk += '<text x="' + pad + '" y="' + ty + '" font-size="13" fill="' + esc(ink) + '" fill-opacity="0.8">' + esc(o.subtitle) + '</text>'; ty += 6; }
    if (blk) head = +(ty + pad * 0.6).toFixed(1);
    if (o.source) { foot = 24; blk += '<text x="' + pad + '" y="' + f1(head + R.height + 15) + '" font-size="11" fill="' + esc(ink) + '" fill-opacity="0.72">' + esc(o.source) + '</text>'; }
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f1(R.width) + ' ' + f1(R.height + head + foot) + '" width="' + Math.round(R.width) + '" height="' + Math.round(R.height + head + foot) + '" font-family="Inter, \'Segoe UI\', Roboto, system-ui, sans-serif"' + (o.title ? ' role="img" aria-label="' + esc(o.title) + '"' : '') + '>');
    if (o.title) out.push('<title>' + esc(o.title) + '</title>');
    if (blk) out.push(blk);
    if (head) out.push('<g transform="translate(0 ' + head + ')">');
    var path = function (pts) { var d = 'M' + f1(pts[0][0]) + ',' + f1(pts[0][1]); for (var i = 1; i < pts.length; i++) { var a = pts[i - 1], b = pts[i]; if (LR) { var m = (b[0] - a[0]) / 2; d += ' C' + f1(a[0] + m) + ',' + f1(a[1]) + ' ' + f1(b[0] - m) + ',' + f1(b[1]) + ' ' + f1(b[0]) + ',' + f1(b[1]); } else { var q = (b[1] - a[1]) / 2; d += ' C' + f1(a[0]) + ',' + f1(a[1] + q) + ' ' + f1(b[0]) + ',' + f1(b[1] - q) + ' ' + f1(b[0]) + ',' + f1(b[1]); } } return d; };
    /* a tapered link: the same curve as path(), drawn as a filled shape that narrows from 5 to 1 px along its length */
    var taperPath = function (pts) {
      var P = [], i, k, n = 12;
      P.push(pts[0]);
      for (i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], c1 = LR ? [a[0] + (b[0] - a[0]) / 2, a[1]] : [a[0], a[1] + (b[1] - a[1]) / 2], c2 = LR ? [b[0] - (b[0] - a[0]) / 2, b[1]] : [b[0], b[1] - (b[1] - a[1]) / 2];
        for (k = 1; k <= n; k++) { var u = k / n, m = 1 - u; P.push([m * m * m * a[0] + 3 * m * m * u * c1[0] + 3 * m * u * u * c2[0] + u * u * u * b[0], m * m * m * a[1] + 3 * m * m * u * c1[1] + 3 * m * u * u * c2[1] + u * u * u * b[1]]); }
      }
      var cum = [0], tot = 0, Lh = [], Rh = [];
      for (i = 1; i < P.length; i++) { tot += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); cum.push(tot); }
      for (i = 0; i < P.length; i++) {
        var p0 = P[Math.max(0, i - 1)], p1 = P[Math.min(P.length - 1, i + 1)], tx = p1[0] - p0[0], ty = p1[1] - p0[1], d = Math.hypot(tx, ty) || 1, h = (5 - 4 * (tot > 0 ? cum[i] / tot : 0)) / 2;
        Lh.push([P[i][0] - ty / d * h, P[i][1] + tx / d * h]); Rh.push([P[i][0] + ty / d * h, P[i][1] - tx / d * h]);
      }
      return 'M' + Lh.concat(Rh.reverse()).map(function (q) { return f1(q[0]) + ',' + f1(q[1]); }).join(' L');
    };
    R.edges.forEach(function (e) {
      var a = R.pos[e.from], b = R.pos[e.to], back = e.kind === 'back' || e.kind === 'flat' || (e.kind === 'tag' && !e.tagFwd), col = back ? gold : line;
      if (!hot(e)) col = fade(col);
      var dash = back ? ' stroke-dasharray="6 4"' : '';
      if (e.kind === 'self') return;
      if (e.kind === 'tag') {
        var up = e.tagFwd, s0 = LR ? [a.x + (up ? a.w : 0), cy(a)] : [cx(a), a.y + (up ? a.h : 0)], s1 = LR ? [b.x + (up ? 0 : b.w), cy(b)] : [cx(b), b.y + (up ? 0 : b.h)], d0 = (LR ? [up ? 1 : -1, 0] : [0, up ? 1 : -1]), d1 = [-d0[0], -d0[1]];
        var e0 = [s0[0] + d0[0] * 24, s0[1] + d0[1] * 24], e1 = [s1[0] + d1[0] * 24, s1[1] + d1[1] * 24], g = LR ? (up ? '\u2192 ' : '\u2190 ') : (up ? '\u2193 ' : '\u2191 ');
        out.push('<path d="M' + f1(s0[0]) + ',' + f1(s0[1]) + ' L' + f1(e0[0]) + ',' + f1(e0[1]) + '" fill="none" stroke="' + col + '" stroke-width="2"/><path d="M' + f1(e1[0]) + ',' + f1(e1[1]) + ' L' + f1(s1[0]) + ',' + f1(s1[1]) + '" fill="none" stroke="' + col + '" stroke-width="2"/>');
        out.push('<text x="' + f1(e0[0] + (LR ? (up ? 4 : -4) : 0)) + '" y="' + f1(e0[1] + (LR ? 4 : (up ? 12 : -4))) + '" font-size="10.5" fill="' + (back ? gold : muted) + '" text-anchor="' + (LR ? (up ? 'start' : 'end') : 'middle') + '">' + g + name(b) + '</text>');
        out.push('<text x="' + f1(e1[0] + (LR ? (up ? -4 : 4) : 0)) + '" y="' + f1(e1[1] + (LR ? 4 : (up ? -4 : 12))) + '" font-size="10.5" fill="' + (back ? gold : muted) + '" text-anchor="' + (LR ? (up ? 'end' : 'start') : 'middle') + '">from ' + name(a) + '</text>');
        return;
      }
      var pts;
      if (e.kind === 'fwd') pts = [LR ? [a.x + a.w, cy(a)] : [cx(a), a.y + a.h]].concat(e.pts, [LR ? [b.x, cy(b)] : [cx(b), b.y]]);
      else if (e.kind === 'back') pts = [LR ? [a.x, cy(a)] : [cx(a), a.y]].concat(e.pts, [LR ? [b.x + b.w, cy(b)] : [cx(b), b.y + b.h]]);
      else { var x = Math.max(a.x + a.w, b.x + b.w) + 30; out.push('<path d="M' + f1(a.x + a.w) + ',' + f1(cy(a)) + ' C' + f1(x) + ',' + f1(cy(a)) + ' ' + f1(x) + ',' + f1(cy(b)) + ' ' + f1(b.x + b.w) + ',' + f1(cy(b)) + '" fill="none" stroke="' + col + '" stroke-width="2"' + dash + '/>'); return; }
      if (o.taper && e.kind === 'fwd') { out.push('<path d="' + taperPath(pts) + 'Z" fill="' + col + '" opacity="0.85"/>'); return; }
      out.push('<path d="' + path(pts) + '" fill="none" stroke="' + col + '" stroke-width="2"' + dash + ' opacity="0.85"/>');
    });
    R.nodes.forEach(function (n) {
      var keep = hl === null || near[n.id], bf = n.choke ? '#fde7b0' : box;
      out.push('<rect x="' + f1(n.x) + '" y="' + f1(n.y) + '" width="' + f1(n.w) + '" height="' + f1(n.h) + '" rx="8" fill="' + (keep ? bf : fade(bf)) + '" stroke="' + (keep ? boxLine : fade(boxLine)) + '" stroke-width="' + (n.id === hl ? '2.5' : '1.5') + '"/>');
      out.push('<text x="' + f1(cx(n)) + '" y="' + f1(cy(n) + 5) + '" font-size="14" text-anchor="middle" fill="' + ink + '">' + name(n) + '</text>');
    });
    if (head) out.push('</g>');
    out.push('</svg>');
    return out.join('\n');
  }

  return { version: '1.13.0', wasm: WASM, _deep: DEEP, layout: layout, toSvg: toSvg, layered: layered, mapPlaceLine: mapPlaceLine, mapCrossPairs: mapCrossPairs };
}));
