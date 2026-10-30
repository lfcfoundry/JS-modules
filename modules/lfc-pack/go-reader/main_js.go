//go:build js && wasm

// Copyright (c) 2026 LFC Foundry. MIT License.
// Browser entry: puts info, rows and text on globalThis.__lfcpGo for lfcp-go.js. Each takes a Uint8Array and returns a result object {ok, ...} or {error}.
package main

import "syscall/js"

func bytesIn(v js.Value) []byte {
	b := make([]byte, v.Get("length").Int())
	js.CopyBytesToGo(b, v)
	return b
}

func bytesOut(b []byte) js.Value {
	a := js.Global().Get("Uint8Array").New(len(b))
	js.CopyBytesToJS(a, b)
	return a
}

func call(fn func(f *File, data []byte) (any, error)) js.Func {
	return js.FuncOf(func(this js.Value, args []js.Value) any {
		res := map[string]any{}
		data := bytesIn(args[0])
		f, err := Open(data)
		if err == nil {
			var out any
			if out, err = fn(f, data); err == nil {
				res["ok"] = out
				if b, isBytes := out.([]byte); isBytes {
					res["ok"] = bytesOut(b)
				}
			}
		}
		if err != nil {
			res["error"] = err.Error()
		}
		return js.ValueOf(res)
	})
}

func main() {
	api := map[string]any{
		"info": call(func(f *File, data []byte) (any, error) {
			return map[string]any{"rows": f.Rows(), "blocks": len(f.blocks), "size": len(data), "major": f.major, "minor": f.minor}, nil
		}),
		"rows": call(func(f *File, data []byte) (any, error) {
			rows, err := f.ReadRows()
			if err != nil {
				return nil, err
			}
			var buf []byte
			for _, r := range rows {
				buf = appendJSON(buf, r)
				buf = append(buf, '\n')
			}
			return buf, nil
		}),
		"text": call(func(f *File, data []byte) (any, error) { return f.ReadText() }),
	}
	js.Global().Set("__lfcpGo", js.ValueOf(api))
	select {} // keep the runtime alive for later calls
}
