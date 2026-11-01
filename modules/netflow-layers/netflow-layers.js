/*!
 * netflow-layers.js: lay out a graph in rows (a Sugiyama-style layered drawing): top to bottom or left to right, with long links as tags, story order, a column for the pages every route passes, and tall maps cut into columns. No dependencies.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.8.0 (API 1)
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
  var WASM = { b64: /*WASM:order:BEGIN*/'AGFzbQEAAAABHwVgAX8BfGAFf39/f38AYAN/f38AYAN/f3wBfGABfwADCAcAAAECAwQBBQMBABAGDwJ/AUGAiAELfwBBgIgBCwcoBAZtZW1vcnkCAAVvcmRlcgAABXBsYWNlAAULX19oZWFwX2Jhc2UDAQriSQfLCgQRfwJ8BH8BfEEAIQEgACgCmAFBAEogACgCECICIAAoAgwiA0pxIQQgACgCpAEiBUEARyEGIAAoAiAhByAAKAIcIQggACgCFCEJIAAoAgQhCgJAIAAoAgAiC0EBSA0AIAtBA3EhDAJAIAtBBEkNACALQfz///8HcSENQQAhDkEAIQEDQCAHIA5qIg8gCCAOaiIQKAIANgIAIA9BBGogEEEEaigCADYCACAPQQhqIBBBCGooAgA2AgAgD0EMaiAQQQxqKAIANgIAIA5BEGohDiANIAFBBGoiAUcNAAsLIAxFDQAgCCABQQJ0Ig9qIQ4gByAPaiEPA0AgDyAOKAIANgIAIA5BBGohDiAPQQRqIQ8gDEF/aiIMDQALCyAEIAZxIREgABCBgICAACISRAAAAAAAAAAAZCEORAAAAAAAAPC/IRMCQCACQQFIDQAgEkQAAAAAAAAAAGRFDQAgC0EDcSEEIAtBfHEhASALQX9qIRQgEUEBcyEVIANBf2ohFiAKQX5qIRdBACENRAAAAAAAAPC/IRMgCkECSCEGIAlFIQkDQCANIANOIRACQCAGDQAgECANIANrQYGAgIB4cUEBRnEhD0EBIQ4DQCAAIA4gACgCMCAAKAI0IA8QgoCAgAAgCiAOQQFqIg5HDQALIAYNACAXIQ4DQCAAIA4gACgCOCAAKAI8IA8QgoCAgAAgDkF/aiIOQX9HDQALCwJAIAkgEHJBAUcNACAKQQFIDQBBACEOA0AgACAOQQgQg4CAgAAgCiAOQQFqIg5HDQALCyAAEIGAgIAAIhggEiAYIBJjIg4bIRICQCAORQ0AIAtBAUgNAEEAIQwCQCAUQQNJDQBBACEOQQAhDANAIAcgDmoiDyAIIA5qIhAoAgA2AgAgD0EEaiAQQQRqKAIANgIAIA9BCGogEEEIaigCADYCACAPQQxqIBBBDGooAgA2AgAgDkEQaiEOIAEgDEEEaiIMRw0ACwsCQCAERQ0AIAggDEECdCIPaiEOIAcgD2ohDyAEIRADQCAPIA4oAgA2AgAgDkEEaiEOIA9BBGohDyAQQX9qIhANAAsLIBghEgsgEyASIBUgDSAWR3IiDhshEwJAIA4NACALQQFIDQBBACEMAkAgFEEDSQ0AQQAhDkEAIQwDQCAFIA5qIg8gByAOaiIQKAIANgIAIA9BBGogEEEEaigCADYCACAPQQhqIBBBCGooAgA2AgAgD0EMaiAQQQxqKAIANgIAIA5BEGohDiABIAxBBGoiDEcNAAsLIBIhEyAERQ0AIAcgDEECdCIPaiEOIAUgD2ohDyAEIRADQCAPIA4oAgA2AgAgDkEEaiEOIA9BBGohDyAQQX9qIhANAAsgEiETCyASRAAAAAAAAAAAZCEOIA1BAWoiDSACTg0BIBJEAAAAAAAAAABkDQALCwJAIAAoApgBQQFIDQAgDkUNACAAIAcgEhCEgICAACESIBEgE0QAAAAAAAAAAGRxQQFHDQAgACAFIBMQhICAgAAiEyASIBMgEmMiABshEiAARQ0AIAtBAUgNACALQQNxIQ9BACEQAkAgC0F/akEDSQ0AIAtBfHEhDEEAIQBBACEQA0AgByAAaiIOIAUgAGoiCigCADYCACAOQQRqIApBBGooAgA2AgAgDkEIaiAKQQhqKAIANgIAIA5BDGogCkEMaigCADYCACAAQRBqIQAgDCAQQQRqIhBHDQALCwJAIA9FDQAgBSAQQQJ0Ig5qIQAgByAOaiEOA0AgDiAAKAIANgIAIABBBGohACAOQQRqIQ4gD0F/aiIPDQALCyATIRILIBIL8gQEAXwPfwF8A39EAAAAAAAAAAAhAQJAIAAoAgQiAkECSA0ARAAAAAAAAAAAIQFBASEDQQAhBANAIAMhBSAAKAIYIARBAnRqIgNBCGooAgAgA0EEaigCACIGayIHQQFqIQggAygCACEJIAAoAkQhCiAAKAI8IQsgACgCOCEMIAAoAiQhDSAAKAIcIQ4CQCAHQX9IDQAgB0ECaiIDQQdxIQRBACEPAkAgCEEHSQ0AIANBeHEhEEEAIQ8gCiEDA0AgA0IANwIAIANBGGpCADcCACADQRBqQgA3AgAgA0EIakIANwIAIANBIGohAyAQIA9BCGoiD0cNAAsLIARFDQAgCiAPQQJ0aiEDA0AgA0EANgIAIANBBGohAyAEQX9qIgQNAAsLRAAAAAAAAAAAIRECQCAJIAZODQBEAAAAAAAAAAAhEUEAIRIDQAJAIAwgDiAJQQJ0aigCAEECdGoiAygCACITIANBBGooAgAiFE4NACATIRADQEEAIQQCQCANIAsgEEECdGooAgBBAnRqKAIAIgNBAEgNACADQQFqIQNBACEEA0AgCiADQQJ0aigCACAEaiEEIANBf2ogA3EiDyEDIA8NAAsLIBEgEiAEa7egIREgEEEBaiIQIBRHDQALIBMhDwNAAkAgDSALIA9BAnRqKAIAQQJ0aigCACIDIAdKDQAgA0EBaiEDA0AgCiADQQJ0aiIEIAQoAgBBAWo2AgAgA0EAIANrcSADaiIDIAhMDQALCyAPQQFqIg8gFEcNAAsgEiATayAUaiESCyAJQQFqIgkgBkcNAAsLIAEgEaAhASAFIQQgBUEBaiIDIAJHDQALCyABC7oSAxJ/AXwKfwJAIAAoAhggAUECdGoiAUEEaigCACIFIAEoAgAiBmsiB0EBSA0AIAAoAiwhCCAAKAIkIQkgACgCQCIKQXxqIQsgACgCHCIMIAZBAnRqIQ1BACEOA0AgAiANIA5BAnRqKAIAIg9BAnQiEGoiAUEEaigCACIRIAEoAgAiEmshEwJAAkAgBEUNACARIBJGDQACQCATQQFIDQAgAyASQQJ0aiEUQQAhESALIRUDQCAJIBQgEUECdGooAgBBAnRqKAIAIRJBACEQAkAgEUUNACAVIQEgESEQA0AgASgCACIWIBJMDQEgAUEEaiAWNgIAIAFBfGohASAQQX9qIhBBAWpBAUoNAAtBACEQCyAKIBBBAnRqIBI2AgAgFUEEaiEVIBFBAWoiESATRw0ACwsgCiATQQF0QXxxaiEBAkAgE0EBcUUNACABKAIAtyEXDAILIAEoAgAgAUF8aigCAGq3RAAAAAAAAOA/oiEXDAELAkAgESASRg0ARAAAAAAAAAAAIRcCQCARIBJMDQACQAJAIBNBA3EiFg0ARAAAAAAAAAAAIRcgEiEQDAELIAMgEkECdGohAUQAAAAAAAAAACEXIBIhEANAIBBBAWohECAXIAkgASgCAEECdGooAgC3oCEXIAFBBGohASAWQX9qIhYNAAsLIBIgEWtBfEsNACARIBBrIRYgAyAQQQJ0aiEBA0AgFyAJIAEoAgBBAnRqKAIAt6AgCSABQQRqKAIAQQJ0aigCALegIAkgAUEIaigCAEECdGooAgC3oCAJIAFBDGooAgBBAnRqKAIAt6AhFyABQRBqIQEgFkF8aiIWDQALCyAXIBO3oyEXDAELIAkgEGooAgC3IRcLIAggD0EDdGogFzkDACAOQQFqIg4gB0cNAAsgB0EBSA0AIAAoAkghGEEAIQIgDCAGQQJ0aiIVIQ1BECEIA0ACQCACIhRBAXIiDiAUQRBqIgIgByACIAdIIgMbTg0AIAcgCCAHIAhIGyEEIA0hDwNAIBUgDkECdGooAgAhESAOIRACQCAOIBRNDQAgDyEBIA4hEANAAkACQCAAKAIoIhIgEUEDdCITaisDACASIAEoAgAiFkEDdCIKaisDAKEiF0QAAAAAAAAAAGENACAXRAAAAAAAAAAAYw0BDAMLAkAgACgCLCISIBNqKwMAIBIgCmorAwChIhdEAAAAAAAAAABhDQAgF0QAAAAAAAAAAGMNAQwDCyAAKAIkIhIgEUECdGooAgAgEiAWQQJ0aigCAE4NAgsgAUEEaiAWNgIAIAFBfGohASAQQX9qIhAgFEoNAAsLIBUgEEECdGogETYCACAPQQRqIQ8gDkEBaiIOIARHDQALCyANQcAAaiENIAhBEGohCCADDQALAkAgB0ERSA0AIAdB/P///wdxIRkgB0EDcSEaIAwgBkECdGohGyAGIAVrQXxLIRxBECENA0AgDSIdQQN0IR4gGCEfIB1BAXQiDSEDIB0hC0EAISADQCAgIhEgDWoiICAHICAgB0giIRshBAJAAkAgESARIB1qIhAgByAQIAdIGyIPSA0AIBEhFiAPIQEMAQsgHyESIA8hASARIRYgECAETg0AA0ACQAJAIAAoAigiECAVIAFBAnRqIhMoAgAiAkEDdCIUaisDACAQIBUgFkECdGoiCigCACIIQQN0Ig5qKwMAoSIXRAAAAAAAAAAAYg0AAkAgACgCLCIQIBRqKwMAIBAgDmorAwChIhdEAAAAAAAAAABiDQAgACgCJCIQIAJBAnRqKAIAIBAgCEECdGooAgBIIRAMAgsgF0QAAAAAAAAAAGMhEAwBCyAXRAAAAAAAAAAAYyEQCyASIBMgCiAQGygCADYCACARQQFqIREgASAQaiEBIBYgEEEBc2oiFiAPTg0BIBJBBGohEiABIARIDQALCwJAAkAgFiAPSA0AIBEhCgwBCwJAIAsgByALIAdIGyIOIBZrQQNxIhRFDQAgESAUaiEKIBsgFkECdGohECAYIBFBAnRqIRIgFEECdCETA0AgEiAQKAIANgIAIBBBBGohECASQQRqIRIgE0F8aiITDQALCyAWIA5rQXxLDQBBACARIBRqIhBrIRIgDiAWIBRqIhZrIREgGCAQQQJ0aiEQIBsgFkECdGohFgNAIBAgFigCADYCACAQQQRqIBZBBGooAgA2AgAgEEEIaiAWQQhqKAIANgIAIBBBDGogFkEMaigCADYCACASQXxqIRIgEEEQaiEQIBZBEGohFiARQXxqIhENAAtBACASayEKCwJAIAEgBE4NAAJAIAMgByADIAdIGyITIAFrQQNxIhFFDQAgGyABQQJ0aiEQIBggCkECdGohFiARQQJ0IRIDQCAWIBAoAgA2AgAgEEEEaiEQIBZBBGohFiASQXxqIhINAAsLIAEgE2tBfEsNACATIAEgEWoiEGshFiAYIAogEWpBAnRqIQEgGyAQQQJ0aiEQA0AgASAQKAIANgIAIAFBBGogEEEEaigCADYCACABQQhqIBBBCGooAgA2AgAgAUEMaiAQQQxqKAIANgIAIAFBEGohASAQQRBqIRAgFkF8aiIWDQALCyAfIB5qIR8gAyANaiEDIAsgDWohCyAhDQALQQAhEgJAIBwNAEEAIQFBACESA0AgFSABaiIQIBggAWoiFigCADYCACAQQQRqIBZBBGooAgA2AgAgEEEIaiAWQQhqKAIANgIAIBBBDGogFkEMaigCADYCACABQRBqIQEgGSASQQRqIhJHDQALCwJAIBpFDQAgGCASQQJ0IhBqIQEgGyAQaiEQIBohFgNAIBAgASgCADYCACABQQRqIQEgEEEEaiEQIBZBf2oiFg0ACwsgDSAHSA0ACwsgB0EBSA0AIAdBA3EhFkEAIQECQCAGIAVrQXxLDQAgB0H8////B3EhEEEAIQEDQCAJIBUoAgBBAnRqIAE2AgAgCSAVQQRqKAIAQQJ0aiABQQFqNgIAIAkgFUEIaigCAEECdGogAUECajYCACAJIBVBDGooAgBBAnRqIAFBA2o2AgAgFUEQaiEVIAFBBGoiASAQRw0ACwsgFkUNACAMIAFBAnQgBkECdGpqIRADQCAJIBAoAgBBAnRqIAE2AgAgEEEEaiEQIAFBAWohASAWQX9qIhYNAAsLC8AIAR1/I4CAgIAAQRBrIQMCQCAAKAIYIgQgAUEBaiIFQQJ0aigCACAEIAFBAnRqKAIAIgRrIgZBAkgNACAAKAIcIARBAnRqIQcgACgCKCEIIAAoAiQhCSACQQAgAkEAShshCiAFIAAoAgROIQtBACEMA0AgDCAKRg0BIAxBAWohDEEAIQ1BASECQQAhDgNAIA4hDyACIQ4gByAPQQJ0aiIQKAIAIREgEEEEaiISKAIAIRMgA0EANgIMIANBADYCCAJAIAggEUEDdGorAwAgCCATQQN0aisDAGINAAJAIAsNACAAKAI4IgQgEUECdGoiAigCACIUIAJBBGooAgAiFU4NACAEIBNBAnRqIgJBBGooAgAiFiACKAIAIhdMDQAgACgCJCEYIAAoAjwiGSAXQQJ0aiEaIBYgF2tBAXEhGyAWIBdBAWoiHEYhHQNAIBggGSAUQQJ0aigCAEECdGooAgAhBCAXIQICQCAbRQ0AIANBDGohBQJAIAQgGCAaKAIAQQJ0aigCACIeSg0AIANBCGohBSAcIQIgBCAeTg0BCyAFIAUoAgBBAWo2AgAgHCECCwJAIB0NACAWIAJrIR4gGSACQQJ0aiECA0AgA0EMaiEFAkACQCAEIBggAigCAEECdGooAgAiH0oNACADQQhqIQUgBCAfTg0BCyAFIAUoAgBBAWo2AgALIANBDGohBQJAAkAgBCAYIAJBBGooAgBBAnRqKAIAIh9KDQAgA0EIaiEFIAQgH04NAQsgBSAFKAIAQQFqNgIACyACQQhqIQIgHkF+aiIeDQALCyAUQQFqIhQgFUcNAAsLAkAgAUEBSA0AIAAoAjAiBCARQQJ0aiICKAIAIhQgAkEEaigCACIVTg0AIAQgE0ECdGoiAkEEaigCACIWIAIoAgAiF0wNACAAKAIkIRggACgCNCIZIBdBAnRqIRogFiAXa0EBcSEbIBYgF0EBaiIcRiEdA0AgGCAZIBRBAnRqKAIAQQJ0aigCACEEIBchAgJAIBtFDQAgA0EMaiEFAkAgBCAYIBooAgBBAnRqKAIAIh5KDQAgA0EIaiEFIBwhAiAEIB5ODQELIAUgBSgCAEEBajYCACAcIQILAkAgHQ0AIBYgAmshHiAZIAJBAnRqIQIDQCADQQxqIQUCQAJAIAQgGCACKAIAQQJ0aigCACIfSg0AIANBCGohBSAEIB9ODQELIAUgBSgCAEEBajYCAAsgA0EMaiEFAkACQCAEIBggAkEEaigCAEECdGooAgAiH0oNACADQQhqIQUgBCAfTg0BCyAFIAUoAgBBAWo2AgALIAJBCGohAiAeQX5qIh4NAAsLIBRBAWoiFCAVRw0ACwsgAygCCCADKAIMTg0AIAkgEUECdGogDjYCACAJIBNBAnRqIA82AgAgEiARNgIAIBAgEzYCAEEBIQ0LIA5BAWoiAiAGRw0ACyANDQALCwv4BgIPfwF8IAAoAqABIQMgACgCGCEEIAAoAiQhBSAAKAIcIQYgACgCBCEHAkAgACgCACIIQQFIDQAgCEEDcSEJQQAhCgJAIAhBBEkNACAIQfz///8HcSELQQAhDEEAIQoDQCAGIAxqIg0gASAMaiIOKAIANgIAIA1BBGogDkEEaigCADYCACANQQhqIA5BCGooAgA2AgAgDUEMaiAOQQxqKAIANgIAIAxBEGohDCALIApBBGoiCkcNAAsLIAlFDQAgASAKQQJ0Ig1qIQwgBiANaiENA0AgDSAMKAIANgIAIAxBBGohDCANQQRqIQ0gCUF/aiIJDQALCwJAIAdBAUgNACAEKAIAIQ5BACELA0ACQCAOIgwgBCALIg1BAWoiC0ECdGoiCSgCACIOTg0AIAQgDUECdGohCiAGIAxBAnRqIQ0DQCAFIA0oAgBBAnRqIAwgCigCAGs2AgAgDUEEaiENIAxBAWoiDCAJKAIAIg5IDQALCyALIAdHDQALCwJAIAAoApgBQQFIDQAgAkQAAAAAAAAAAGRFDQAgCEH8////B3EhCiAIQQNxIQ8gB0F+aiEQQQAhCyAHQQJIIQQgCEEESSERQQAhBQNAIAUgACgCnAFODQECQCAEDQAgC0EBcSENQQEhDANAIAAgDCAAKAIwIAAoAjQgDRCCgICAACAAIAwgAxCDgICAACAHIAxBAWoiDEcNAAsgECEMIAQNAANAIAAgDCAAKAI4IAAoAjwgDRCCgICAACAAIAwgAxCDgICAACAMQX9qIgxBf0cNAAsLAkAgB0EBSA0AQQAhDANAIAAgDCADEIOAgIAAIAcgDEEBaiIMRw0ACwsCQAJAIAAQgYCAgAAiEiACY0UNAEEAIQUCQCAIQQFIDQBBACEJAkAgEQ0AQQAhDEEAIQkDQCABIAxqIg0gBiAMaiIOKAIANgIAIA1BBGogDkEEaigCADYCACANQQhqIA5BCGooAgA2AgAgDUEMaiAOQQxqKAIANgIAIAxBEGohDCAKIAlBBGoiCUcNAAsLIA9FDQAgBiAJQQJ0Ig1qIQwgASANaiENIA8hDgNAIA0gDCgCADYCACAMQQRqIQwgDUEEaiENIA5Bf2oiDg0ACwsgEiECDAELIAVBAWohBQsgC0EBaiILIAAoApgBTg0BIAJEAAAAAAAAAABkDQALCyACC7MFARZ/IAAoAlQhASAAKAJ0IQIgACgCBCEDAkACQCAAKAIAIgRBAU4NAEEAIQUMAQsgACgCXCEGIAAoAlAhByAAKAJMIQggACgCWCEJIAAoAjwhCiAAKAI4IQsgACgCNCEMIAAoAjAhDUEAIQ5BACEFA0AgASAOQQJ0Ig9qIAU2AgACQCANIA9qKAIAIhAgDSAOQQFqIg5BAnQiEWoiEigCAE4NACAJIAVBAnRqIRMgBiAFQQN0aiEUIAwgEEECdGohFSAIIBBBA3RqIRYDQCATIBUoAgA2AgAgFCAWKwMAOQMAIBNBBGohEyAUQQhqIRQgFUEEaiEVIBZBCGohFiAFQQFqIQUgEEEBaiIQIBIoAgBIDQALCwJAIAsgD2ooAgAiECALIBFqIhIoAgBODQAgCSAFQQJ0aiETIAYgBUEDdGohFCAKIBBBAnRqIRUgByAQQQN0aiEWA0AgEyAVKAIANgIAIBQgFisDADkDACATQQRqIRMgFEEIaiEUIBVBBGohFSAWQQhqIRYgBUEBaiEFIBBBAWoiECASKAIASA0ACwsgDiAERw0ACwsgASAEQQJ0aiAFNgIAAkAgAkEBSA0AIANBAkgNACADQX9qIRVBACETA0ACQAJAIBNBA3BBAkYiFA0AQQEhBQNAIAAgBSAAKAIwIAAoAjQgACgCTBCGgICAACADIAVBAWoiBUcNAAwCCwtBASEFA0AgACAFIAAoAlQgACgCWCAAKAJcEIaAgIAAIAMgBUEBaiIFRw0ACwsgFSEFAkACQCAURQ0AIBUhBQNAIAAgBUF/aiIFIAAoAlQgACgCWCAAKAJcEIaAgIAAIAVBAEoNAAwCCwsDQCAAIAVBf2oiBSAAKAI4IAAoAjwgACgCUBCGgICAACAFQQBKDQALCyATQQFqIhMgAkcNAAsLC/ESBBl/AnwCfwV8AkAgACgCGCABQQJ0aiIBQQRqKAIAIgUgASgCACIGRg0AIAAoAoQBIQdBACEIAkAgBSAGayIJQQBKDQAgB0IANwMADAELIAAoAnAhCiAAKAJsIQsgACgCaCEMIAAoApQBIQ0gACgCjAEhDiAAKAKIASEPIAAoAnwhECAAKAJ4IREgACgCZCESIAAoAmAhEyAAKAKQASEUIAAoAoABIhVBeGohFiAAKAIcIhcgBkECdGohGANAAkACQAJAAkACQCACIBggCEECdGooAgAiGUECdGoiAEEEaigCACIaIAAoAgAiG0wiHA0AIBogG0F/c2ohHUQAAAAAAAAAACEeRAAAAAAAAAAAIR8gGyEBAkAgGiAbayIgQQFxRQ0AIBMgAyAbQQJ0aigCAEEDdGorAwAgBCAbQQN0aisDACIeokQAAAAAAAAAAKAhHyAbQQFqIQEgHkQAAAAAAAAAAKAhHgsCQCAdRQ0AIBogAWshISADIAFBAnRqIQAgBCABQQN0aiEBA0AgHiABKwMAIiKgIAFBCGorAwAiI6AhHiAfIBMgACgCAEEDdGorAwAgIqKgIBMgAEEEaigCAEEDdGorAwAgI6KgIR8gAEEIaiEAIAFBEGohASAhQX5qIiENAAsLIAwgGWotAAANASAeRAAAAAAAAAAAYg0CDAMLIAwgGWotAABFDQILIBEgCEEDdGpCADcDAEQAAAAAAECPQCEeDAILIB8gHqMhHwJAIApFDQAgCyAZai0AAA0AICBBAkgNAEQAAAAAAAD4fyEfAkAgHA0AAkACQCAgQQNxIgENAEQAAAAAAADwfyEfRAAAAAAAAPD/ISIMAQsgAyAbQQJ0aiEARAAAAAAAAPB/IR9EAAAAAAAA8P8hIgNAIBtBAWohGyAiIBMgACgCAEEDdGorAwAiI6UhIiAfICOkIR8gAEEEaiEAIAFBf2oiAQ0ACwsCQCAdQQNJDQAgGiAbayEBIAMgG0ECdGohAANAICIgEyAAKAIAQQN0aisDACIjpSATIABBBGooAgBBA3RqKwMAIiSlIBMgAEEIaigCAEEDdGorAwAiJaUgEyAAQQxqKAIAQQN0aisDACImpSEiIB8gI6QgJKQgJaQgJqQhHyAAQRBqIQAgAUF8aiIBDQALCyAfICKgIR8LIB9EAAAAAAAA4D+iIR8LIBEgCEEDdGogHzkDACAeRAAAAAAAAABARAAAAAAAAAAAIAsgGWotAAAboCEeDAELIBEgCEEDdGogEyAZQQN0aisDADkDAESamZmZmZnJPyEeCyAQIAhBA3QiAGogHjkDAAJAIAhFDQAgFiAAaiASIBlBA3RqKwMAOQMACyAIQQFqIgggCUcNAAsgB0IANwMAQQAhGAJAIAlBAUYNACAFIAZBf3NqIgFBA3EhCEQAAAAAAAAAACEeQQEhAAJAIAlBfmpBA0kNACABQXxxIRlEAAAAAAAAAAAhHkEAIQBBACEbA0AgByAAaiIBQQhqIB4gFSAAaiIhKwMAoCIeOQMAIAFBEGogHiAhQQhqKwMAoCIeOQMAIAFBGGogHiAhQRBqKwMAoCIeOQMAIAFBIGogHiAhQRhqKwMAoCIeOQMAIABBIGohACAZIBtBBGoiG0cNAAsgG0EBaiEACyAJQQFHIRggCEUNACAHIABBA3QiAWohACABIBVqQXhqIQEDQCAAIB4gASsDAKAiHjkDACABQQhqIQEgAEEIaiEAIAhBf2oiCA0ACwsCQAJAAkAgCUEBSA0AIA5BeGohAiAPQXhqIRwgFEF8aiEMQQAhGkEAIRkDQCAPIBlBA3QiAWogECAaQQN0IgBqIiErAwAgESAAaisDACAHIABqKwMAoaI5AwAgFCAZQQJ0IhtqQQE2AgAgDiABaiAhKwMAIh45AwAgGUEBaiEIAkACQCAZQQFODQAgCCEZDAELIAIgAWohACAcIAFqIQEgDCAbaiEhQQEhGwNAAkAgASsDACIfIAArAwCjIAFBCGorAwAiIiAeo2QNACAIIRkMAgsgASAfICKgOQMAICEgISgCACAbaiIbNgIAIAAgAEEIaisDACAAKwMAoCIeOQMAIABBeGohACABQXhqIQEgIUF8aiEhQQEhGSAIQX9qIghBAWpBAksNAAsLIBpBAWoiGiAJRw0ACwJAIBlBAUgNAEEAIRpBACEIA0ACQCAUIAhBAnRqKAIAIhtBAUgNACAPIAhBA3QiAGorAwAgDiAAaisDAKMhHiAaIRACQCAbQQNxIiFFDQAgGiAhaiEQIAcgGkEDdCIBaiEAIA0gAWohAQNAIAEgHiAAKwMAoDkDACAAQQhqIQAgAUEIaiEBICFBf2oiIQ0ACwsgGiAbaiEaIBtBBEkNACAbQXxxISEgByAQQQN0IgFqIQAgDSABaiEBA0AgASAeIAArAwCgOQMAIAFBCGogHiAAQQhqKwMAoDkDACABQRBqIB4gAEEQaisDAKA5AwAgAUEYaiAeIABBGGorAwCgOQMAIABBIGohACABQSBqIQEgIUF8aiIhDQALCyAIQQFqIgggGUcNAAsLIBgNAQwCCyAYRQ0CC0EBIQAgBSAGQX9zaiIBQQFxIRkgDSsDACEeAkAgBUF+aiAGRg0AIA1BEGohACABQX5xIRtBACEhIBUhAQNAAkAgAEF4aiIIKwMAIh8gHiABKwMAoCIeY0UNACAIIB45AwAgHiEfCwJAIAArAwAiHiAfIAFBCGorAwCgIh9jRQ0AIAAgHzkDACAfIR4LIAFBEGohASAAQRBqIQAgGyAhQQJqIiFHDQALICFBAWohAAsgGUUNACANIABBA3QiAGoiASsDACAeIBVBeGogAGorAwCgIh5jRQ0AIAEgHjkDAAsgCUEBSA0AIAlBA3EhIUEAIQgCQCAGIAVrQXxLDQAgFyAGQQJ0aiEAIAlB/P///wdxIRtBACEIIA0hAQNAIBMgACgCAEEDdGogASsDADkDACATIABBBGooAgBBA3RqIAFBCGorAwA5AwAgEyAAQQhqKAIAQQN0aiABQRBqKwMAOQMAIBMgAEEMaigCAEEDdGogAUEYaisDADkDACAAQRBqIQAgAUEgaiEBIBsgCEEEaiIIRw0ACwsgIUUNACAXIAhBAnQgBkECdGpqIQAgDSAIQQN0aiEBA0AgEyAAKAIAQQN0aiABKwMAOQMAIAFBCGohASAAQQRqIQAgIUF/aiIhDQALCws='/*WASM:order:END*/, on: true, min: 100, calls: 0, error: '', mod: null, inst: null, tried: false };
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
    'upW', 'dnW', 'bothOff', 'bothIdx', 'bothW', 'cA', 'gap', 'choke', 'dummy', 'WIDE', 'ITERS', 'want', 'wt', 'gaps', 'off', 'bs', 'bw', 'bn', 'out', 'DEEPMAX', 'DEEPSTALL', 'DEEPTG', 'pre'];
  /* Lay out the lists one call needs in wasm memory (grown once, here) and copy the fixed ones in. Returns null when that cannot be done. */
  function wasmPrep(nV, nL, maxLen, nLk, up, down, laneA, vert) {
    var ex = wasmEngine();
    if (!ex) return null;
    try {
      var HEAD = 65536, at = HEAD + 1024, p = {}, i, mem = ex.memory;
      var want = [['rowOff', 4 * (nL + 2)], ['ord', 4 * nV], ['best', 4 * nV], ['pos', 4 * nV], ['lane', 8 * nV], ['bary', 8 * nV], ['upOff', 4 * (nV + 1)], ['upIdx', 4 * nLk], ['dnOff', 4 * (nV + 1)], ['dnIdx', 4 * nLk],
        ['scr', 4 * (nLk + 1)], ['fen', 4 * (maxLen + 3)], ['tmp', 4 * (nV + 1)], ['upW', 8 * nLk], ['dnW', 8 * nLk], ['bothOff', 4 * (nV + 1)], ['bothIdx', 8 * nLk], ['bothW', 16 * nLk], ['cA', 8 * nV], ['gap', 8 * nV],
        ['choke', nV], ['dummy', nV], ['want', 8 * maxLen], ['wt', 8 * maxLen], ['gaps', 8 * maxLen], ['off', 8 * maxLen], ['bs', 8 * maxLen], ['bw', 8 * maxLen], ['bn', 4 * maxLen], ['out', 8 * maxLen], ['pre', 4 * nV]];
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
      var RB = layered({ nodes: G.nodes.map(cp), edges: G.edges.map(cp) }, oB);
      if (RB.crossings < RA.crossings) RA = layered(G, oB);
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
    var addLink = function (a, b, w) { lkA.push(a); lkB.push(b); lkW.push(w); };
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
    var csr = function (from, to, extra) {
      var off = new Int32Array(nV + 1), idx = new Int32Array(nLk), w = new Float64Array(nLk), i, f;
      for (i = 0; i < nLk; i++) off[from(i).idx + 1]++;
      for (i = 0; i < nV; i++) off[i + 1] += off[i];
      var fill = off.slice(0, nV);
      for (i = 0; i < nLk; i++) { f = from(i).idx; idx[fill[f]] = to(i).idx; w[fill[f]++] = lkW[i]; }
      return { off: off, idx: idx, w: w };
    };
    var up = csr(function (i) { return lkB[i]; }, function (i) { return lkA[i]; }), down = csr(function (i) { return lkA[i]; }, function (i) { return lkB[i]; });
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
      list.sort(function (a, b) { return laneA[a.idx] - laneA[b.idx] || a.key - b.key; });
      list.forEach(function (v, i) { v.pos = i; posA[v.idx] = i; });
    });
    /* crossings between row k and row k+1 on flat number lists (the same count as mapCrossPairs gives): each link is one number, upper place * K + lower place, sorted as numbers */
    var maxSeg = 0, maxLen = 0;
    L.forEach(function (list) { var m = 0; list.forEach(function (u) { m += down.off[u.idx + 1] - down.off[u.idx]; }); if (m > maxSeg) maxSeg = m; if (list.length > maxLen) maxLen = list.length; });
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
  function toSvg(R, o) {
    o = o || {};
    var gold = o.gold || '#c98a00', line = o.line || '#6b7a90', box = o.box || '#eaf0f8', boxLine = o.boxLine || '#44546a', ink = o.text || '#222', muted = o.muted || '#667', LR = R.dir !== 'TB', out = [];
    var name = function (n) { return esc(n.label !== undefined ? n.label : n.id); }, cx = function (n) { return n.x + n.w / 2; }, cy = function (n) { return n.y + n.h / 2; };
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f1(R.width) + ' ' + f1(R.height) + '" width="' + Math.round(R.width) + '" height="' + Math.round(R.height) + '" font-family="system-ui,sans-serif">');
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
      var a = R.pos[e.from], b = R.pos[e.to], back = e.kind === 'back' || e.kind === 'flat' || (e.kind === 'tag' && !e.tagFwd), col = back ? gold : line, dash = back ? ' stroke-dasharray="6 4"' : '';
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
      else if (e.kind === 'back') pts = [LR ? [a.x, cy(a)] : [cx(a), a.y]].concat(e.pts.slice().reverse(), [LR ? [b.x + b.w, cy(b)] : [cx(b), b.y + b.h]]);
      else { var x = Math.max(a.x + a.w, b.x + b.w) + 30; out.push('<path d="M' + f1(a.x + a.w) + ',' + f1(cy(a)) + ' C' + f1(x) + ',' + f1(cy(a)) + ' ' + f1(x) + ',' + f1(cy(b)) + ' ' + f1(b.x + b.w) + ',' + f1(cy(b)) + '" fill="none" stroke="' + col + '" stroke-width="2"' + dash + '/>'); return; }
      if (o.taper && e.kind === 'fwd') { out.push('<path d="' + taperPath(pts) + 'Z" fill="' + col + '" opacity="0.85"/>'); return; }
      out.push('<path d="' + path(pts) + '" fill="none" stroke="' + col + '" stroke-width="2"' + dash + ' opacity="0.85"/>');
    });
    R.nodes.forEach(function (n) {
      out.push('<rect x="' + f1(n.x) + '" y="' + f1(n.y) + '" width="' + f1(n.w) + '" height="' + f1(n.h) + '" rx="8" fill="' + (n.choke ? '#fde7b0' : box) + '" stroke="' + boxLine + '" stroke-width="1.5"/>');
      out.push('<text x="' + f1(cx(n)) + '" y="' + f1(cy(n) + 5) + '" font-size="14" text-anchor="middle" fill="' + ink + '">' + name(n) + '</text>');
    });
    out.push('</svg>');
    return out.join('\n');
  }

  return { version: '1.8.0', wasm: WASM, _deep: DEEP, layout: layout, toSvg: toSvg, layered: layered, mapPlaceLine: mapPlaceLine, mapCrossPairs: mapCrossPairs };
}));
