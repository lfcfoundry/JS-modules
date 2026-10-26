// Copyright (c) 2026 LFC Foundry. MIT License. Edge cases for the NDJSON tokenizer: [name, text]. Copied from the LFC-pack research set.
const cases=[
 ['whitespace/pretty text','{"a": 1,  "b" : [1, 2]}', 'text'],
 ['escape spelling \\u00e9 vs é','{"a":"\\u00e9","b":"é"}','text'],
 ['number text 1.0 / 1e2 / -0','{"a":1.0,"b":1e2,"c":-0,"d":0.10}','text'],
 ['big int 2^53+1','{"a":9007199254740993}','value'],
 ['big decimal 0.1000000000000000055511151231257827','{"a":0.1000000000000000055511151231257827}','value'],
 ['exact decimal 2.00','{"a":2.00}','value'],
 ['key order','{"z":1,"a":2}','value'],
 ['duplicate keys','{"a":1,"a":2}','value'],
 ['integer-like key order','{"b":1,"2":2,"1":3}','value'],
 ['unicode astral 😀','{"a":"😀","b":"\\ud83d\\ude00"}','value'],
 ['lone surrogate','{"a":"\\ud800"}','value'],
 ['null char in string','{"a":"x\\u0000y"}','value'],
 ['empty key / nested empty','{"":1,"o":{},"l":[]}','value'],
 ['__proto__ key','{"__proto__":{"x":1}}','value'],
 ['NaN-like strings','{"a":"NaN","b":"Infinity"}','value'],
 ['mixed types per path','{"a":1}\n{"a":"1"}\n{"a":null}\n{"a":[1]}\n{"a":{"b":true}}','value'],
 ['huge exponent 1e400','{"a":1e400}','value'],
 ['key constructor/toString/hasOwnProperty','{"constructor":1,"toString":2,"hasOwnProperty":3}','value'],
 ['5e-324 / -0 / 1E5','{"a":5e-324,"b":-0.0,"c":1E5}','value'],
 ['newline and tab escapes','{"a":"x\\ny\\tz\\r"}','value'],
 ['top-level scalar','5\n"s"\ntrue\nnull','value'],
 ['top-level array','[1,2,{"a":3}]','value'],
 ['deep nesting 5000','"DEEP"','value'],
];
cases.forEach(c=>{if(c[1]==='"DEEP"')c[1]='['.repeat(5000)+']'.repeat(5000)});
module.exports=cases.map(c=>[c[0],c[1]]);
