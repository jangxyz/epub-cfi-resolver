const debug = false; // Enable debug output?

//var tape = require('tape');
//var CFI = require('../index.js');
var { default: tape } = await import('tape');
var { default: CFI } = await import('../index.js');

// Allow these tests to run outside of the browser
//var JSDOM = require('jsdom').JSDOM;
var JSDOM = (await import('jsdom')).JSDOM;
function parseDOM(str, mimetype) {
  return new JSDOM(str, {
    contentType: mimetype
  }).window.document;
}

//var docs = require('../test_data/from_spec.js');
var docs = await import('../test_data/from_spec.js');

var tests = [
  {
    cfi: "epubcfi(/1/2)",
    parsed: [
      [
        {
          "nodeIndex": 1
        },
        {
          "nodeIndex": 2
        }
      ]
    ]
  }, {
    cfi: "epubcfi(/1/0)",
    parsed: [
      [
        {
          "nodeIndex": 1
        },
        {
          "nodeIndex": 0
        }
      ]
    ]
  }, {
    cfi: "epubcfi(/1/2:3[pre,post])",
    parsed: [
      [
        {
          "nodeIndex": 1
        },
        {
          "nodeIndex": 2,
          "offset": 3,
          "textLocationAssertion": {
            "pre": "pre",
            "post": "post"
          }
        }
      ]
    ]
  }, {
    cfi: "epubcfi(/1/2:3[,post])",
    parsed: [
      [
        {
          "nodeIndex": 1
        },
        {
          "nodeIndex": 2,
          "offset": 3,
          "textLocationAssertion": {
            "post": "post"
          }
        }
      ]
    ]
  }, {
    cfi: "epubcfi(/1/2:3[pre,])",
    parsed: [
      [
        {
          "nodeIndex": 1
        },
        {
          "nodeIndex": 2,
          "offset": 3,
          "textLocationAssertion": {
            "pre": "pre"
          }
        }
      ]
    ]
  }, {
    cfi: "epubcfi(/1[^^^]])",
    parsed: [
      [
        {
          "nodeIndex": 1,
          "nodeID": "^]"
        }
      ]
    ]
  }, {
    cfi: "epubcfi(/1/2:3[,post])",
    parsed: [
      [
        {
          "nodeIndex": 1
        },
        {
          "nodeIndex": 2,
          "offset": 3,
          "textLocationAssertion": {
            "post": "post"
          }
        }
      ]
    ]
  }, {
    cfi: "epubcfi(/6/14[cha!/p05ref]!/4[bo!/dy01]/10/2/1[foo]:5[don't!/ panic;s=b])",
    parsed: [
      [
        {
          "nodeIndex": 6
        },
        {
          "nodeIndex": 14,
          "nodeID": "cha!/p05ref"
        }
      ],
      [
        {
          "nodeIndex": 4,
          "nodeID": "bo!/dy01"
        },
        {
          "nodeIndex": 10
        },
        {
          "nodeIndex": 2
        },
        {
          "nodeIndex": 1,
          "nodeID": "foo",
          "offset": 5,
          "textLocationAssertion": "don't!/ panic",
          "sideBias": "before"
        }
      ]
    ]
  }, {
    cfi: "epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/3:5)",
    parsed: [
      [
        {
          "nodeIndex": 6
        },
        {
          "nodeIndex": 4,
          "nodeID": "chap01ref"
        }
      ],
      [
        {
          "nodeIndex": 4,
          "nodeID": "body01"
        },
        {
          "nodeIndex": 10,
          "nodeID": "para05"
        },
        {
          "nodeIndex": 3,
          "offset": 5
        }
      ]
    ],
    resolvedURI: "chapter01.xhtml",
    resolved: {
      "node": "0123456789",
      "offset": 5
    }
  }, {
    cfi: "epubcfi(/6/4[chap01ref]!/4/10/0)",
    parsed: [
      [
        {
          "nodeIndex": 6
        },
        {
          "nodeIndex": 4,
          "nodeID": "chap01ref"
        }
      ],
      [
        {
          "nodeIndex": 4
        },
        {
          "nodeIndex": 10
        },
        {
          "nodeIndex": 0
        }
      ]
    ],
    resolvedURI: "chapter01.xhtml",
    resolved: {
      "relativeToNode": "before",
      "node": "xxx"
    }
  }, {
    cfi: "epubcfi(/6/4[chap01ref]!/4/10/999)",
    parsed: [
      [
        {
          "nodeIndex": 6
        },
        {
          "nodeIndex": 4,
          "nodeID": "chap01ref"
        }
      ],
      [
        {
          "nodeIndex": 4
        },
        {
          "nodeIndex": 10
        },
        {
          "nodeIndex": 999
        }
      ]
    ],
    resolvedURI: "chapter01.xhtml",
    resolved: {
      "relativeToNode": "after",
      "node": "0123456789"
    }
  }, {
    cfi: "epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/3:5)",
    resolvedURI: "chapter01.xhtml",
    resolved: {
      "node": "0123456789",
      "offset": 5
    },
    opts: {
      ignoreIDs: true
    }
  }, {
    cfi: "epubcfi(/6/4[chap01ref]!/4[body01],/10[para05]/3:5,/10[para05]/3:8)",
    parsed: {
      "from": [
        [
          {
            "nodeIndex": 6
          },
          {
            "nodeIndex": 4,
            "nodeID": "chap01ref"
          }
        ],
        [
          {
            "nodeIndex": 4,
            "nodeID": "body01"
          },
          {
            "nodeIndex": 10,
            "nodeID": "para05"
          },
          {
            "nodeIndex": 3,
            "offset": 5
          }
        ]
      ],
      "to": [
        [
          {
            "nodeIndex": 6
          },
          {
            "nodeIndex": 4,
            "nodeID": "chap01ref"
          }
        ],
        [
          {
            "nodeIndex": 4,
            "nodeID": "body01"
          },
          {
            "nodeIndex": 10,
            "nodeID": "para05"
          },
          {
            "nodeIndex": 3,
            "offset": 8
          }
        ]
      ],
      "isRange": true
    },
    resolvedURI: "chapter01.xhtml",
    resolved: {
      "from": {
        "offset": 5,
        "node": "0123456789"
      },
      "to": {
        "offset": 8,
        "node": "0123456789"
      },
      "isRange": true
    }
  }, {
    cfi: "epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/3:3[34,67])",
    parsed: [
      [
        {
          "nodeIndex": 6
        },
        {
          "nodeIndex": 4,
          "nodeID": "chap01ref"
        }
      ],
      [
        {
          "nodeIndex": 4,
          "nodeID": "body01"
        },
        {
          "nodeIndex": 10,
          "nodeID": "para05"
        },
        {
          "nodeIndex": 3,
          "offset": 3,
          "textLocationAssertion": {
            "pre": "34",
            "post": "67"
          }
        }
      ]
    ],
    resolvedURI: "chapter01.xhtml",
    resolved: {
      "node": "0123456789",
      "offset": 5,
      "textLocationAssertion": {
        "pre": "34",
        "post": "67"
      }
    }
  }, {
    cfi: "epubcfi(/6/14[cha!/p05ref]!/4[bo!/dy01]/10/2/1[foo]~42.43@100:101)",
    parsed: [
      [
        {
          "nodeIndex": 6
        },
        {
          "nodeIndex": 14,
          "nodeID": "cha!/p05ref"
        }
      ],
      [
        {
          "nodeIndex": 4,
          "nodeID": "bo!/dy01"
        },
        {
          "nodeIndex": 10
        },
        {
          "nodeIndex": 2
        },
        {
          "nodeIndex": 1,
          "nodeID": "foo",
          "temporal": 42.43,
          "spatial": {
            "x": 100,
            "y": 101
          }
        }
      ]
    ]
  }, { // test that offset and tempora/spatial are ignored on all but last subpart
    cfi: "epubcfi(/2~42.43@100:101/4!/6/8:100/6:200)",
    parsed: [
      [
        { "nodeIndex": 2 },
        { "nodeIndex": 4 }
      ],
      [
        { "nodeIndex": 6 },
        { "nodeIndex": 8 },
        { "nodeIndex": 6, "offset": 200 }
      ]
    ]
  }, { // Test that parser ignores vender extensions
    cfi: "epubcfi(/2/4vnd.foo/6foo.bar:20)",
    parsed: [
      [
        {
          "nodeIndex": 2
        },
        {
          "nodeIndex": 4
        },
        {
          "nodeIndex": 6,
          "offset": 20
        }
      ]
    ]
  }
];

var testCount = 0;
for(let test of tests) {
  if(test.parsed) testCount++;
  if(test.resolvedURI) testCount++;
  if(test.resolved) testCount++;
}
  
const opfDOM = parseDOM(docs.opf, 'application/xhtml+xml');
const htmlDOM = parseDOM(docs.html, 'application/xhtml+xml');

tape('Simple tests', function(t) {
  
  t.plan(testCount);

  var uri, bookmark;
  for(let test of tests) {

    try {
      const cfi = new CFI(test.cfi);
      
      if(debug) console.log("parsed:", JSON.stringify(cfi.get(), null, 2));

      if(test.parsed) {
        t.deepEqual(cfi.get(), test.parsed);
      }

      if(test.resolvedURI) {

        uri = cfi.resolveURI(0, opfDOM);
        if(debug) console.log("resolvedURI:", uri);
        t.equal(uri, test.resolvedURI);
      }
      
      if(test.resolved) {

        bookmark = cfi.resolveLast(htmlDOM, test.opts);
        if(bookmark.isRange) {
          bookmark.from.node = bookmark.from.node.outerHTML || bookmark.from.node.textContent;
          bookmark.to.node = bookmark.to.node.outerHTML || bookmark.to.node.textContent;
        } else {
          bookmark.node = bookmark.node.outerHTML || bookmark.node.textContent;
        }
        if(debug) console.log("resolved:", JSON.stringify(bookmark, null, 2));
        t.deepEqual(bookmark, test.resolved);
      }

    } catch(err) {
      t.error(err);
    }

  }

});

export {};
