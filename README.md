A simple parser and resolver for the [EPUB-CFI](http://idpf.org/epub/linking/cfi/epub-cfi.html) format.

# Usage

To install:

```
npm install epub-cfi-resolver
```

Remember to unescape the URI first, then:

```
var CFI = require('epub-cfi-resolver');

// parsing
var cfi = new CFI('epubcfi(/1/2!/1/2/3:4', {
  flattenRange: false // default is false
}); 
console.log(cfi.get()); // print parsed data
```

To resolve the CFI, assuming `doc` contains a `Document` or `XMLDocument` object for the starting document:

```
// Use first part of CFI to resolve URI for the second part
var uri = cfi.resolveURI(0, doc);

// Call some function to fetch document for second part of CFI
var data = fetch(uri);

// Parse fetched data
var parser = new DOMParser();
var doc2 = parser.parseFromString(data, 'text/html');

// Note: It is recommended to use XMLHTTPRequest
// rather than the fetch API as XMLHTTPRequest
// will fetch _and_ parse the data in one go.
// This lets the browser handle mimetype detection
// which is otherwise difficult.

// Resolve final part of CFI to a bookmark
var bookmark = cfi.resolve(doc2, {
  range: false // default is false
});

// bookmark contains:
{
  node: <reference to html node in doc2>,
  offset: 4
}
```

You can then use e.g. `bookmark.node.scrollTo()` or some other method to show the location referenced by the CFI.


# API

## new CFI(str, opts)

Parse the CFI contained in `str` and create a CFI object. An error will be thrown if parsing failes.

Opts:

* flattenRange: If true and CFI is a range, pretend it isn't by parsing only the start of the range and ignoring the end. Default is `false`. 

## .get()

Return a copy of the parsed data.

Given this CFI:

```
epubcfi(/1/2[node-id]!/3/4:5[pre,post;s=b]~3.14@4:2)
```

The parser will output:

```
[
  [ // first part of CFI
    {
      "nodeIndex": 1
    },
    {
      "nodeIndex": 2,
      "nodeID": "node-id"
    }
  ],
  [ // part after first '!'
    {
      "nodeIndex": 3
    },
    {
      "nodeIndex": 4,
      "offset": 5,
      "textLocationAssertion": {
        "pre": "pre",
        "post": "post"
      }
      "sideBias": "before",
      "temporal": 3.14,
      "spatial": {
        "from": 4,
        "to": 2
      }
    }
  ]
]
```

If the CFI is a Range then it will output:

```
{
  from: ...
  to: ...
  isRange: true
}
```

Where `from` and `to` each are objects with `nodeIndex` etc. like the one shown above.

If the CFI is a Range and `flattenRange: true` is given to the constructor then the output will be the location of the beginning of the range as normal non-range output.

## .resolveURI(index, doc)

Locate the node referenced by the specified part of the CFI where `index` refers to the part index from zero, e.g for the CFI `/2!/4!/6` an `index` of 1 refers to the `/4` part of the CFI.

`doc` is a `Document` or `XMLDocument` object. I the browser this could be `window.document`.

If the node pointed to by the specified part of the CFI refers to a URI in one of the ways allowed by the EPUB-CFI standard then that URI will be returned. If no URI is found then an error is thrown.

## .resolve(doc, opts)

Assuming that `doc` is a `Document` or `XMLDocument` object for the URI referenced by the last part of the CFI (e.g. for `/2!/4!/6` the last part is `/6), return an object referencing the node (or an 

If the CFI is not a range, the resolver will output an object like:

```
{
  node: <reference to node>,
  offset: <positive integer>
  ...
}
```
including any additional properties from the parser relevant to position _within_ the node, e.g. `.sideBias`. See section on `.get()`.

In addition, the property `.relativeToNode` will be present if the CFI location was _before_ or _after_ a node (rather than _at_ or _inside_ a node). `.relativeToNode` can have the values "before" or "after".

If the CFI is a range then the output will be:

```
{
  from: {
    node: ...
    offset: ...
    ...
  },
  to: {
    node: ...
    offset: ...
    ...
  },
  isRange: true
}
```

unless the option `range: true` is given, in which case the output will be a proper [Range](https://developer.mozilla.org/en-US/docs/Web/API/Range) object.

# Example

To build the example:

```
npm run build
```

Then open `example/example.html` in a browser.

# Using with node.js

For use with node.js, instead of using `DOMParser` and `.parseFromString()` you can use the [jsdom](https://www.npmjs.com/package/jsdom) library like so:

```
var JSDOM = require('jsdom').JSDOM;

var jsdom = new JSDOM(str, {
  contentType: mimetype
});

var doc = jsdom.window.document;
```

Where `mimetype` is one of 'application/xhtml+xml' (for XHTML and XML data) or 'text/html' (for HTML data). Note that 'text/xml' and 'application/xml' are not supported, just use 'application/xhtml+xml' instead which works for XML data.

The `doc` variable will contain a `Document` equivalent to the output from the browser's DOMParser `.parseFromString()` function.

# Unit tests

Run using: `npm run test`

# Supported features

## Parser

Sorting CFIs, which is the same as computing their relative locations, is defined by the official spec but not supported by this library. It's unclear to the author when this feature would be useful.

## Resolver

The resolver only finds the relevant node, corrects the offset if necessary and hands off any other information from the parser (e.g. sideBias). Currently the resolver prefers node ID over child index number when locating nodes (if both are present). Text Location Assertions are used to correct offsets into text nodes if possible.

# About EPUB-CFI

A [CFI](http://idpf.org/epub/linking/cfi/epub-cfi.html), or Canonical Fragment Identifier, is like a more complicated `#anchor` as used in HTML `href=` attributes. Think of them as ebook bookmarks.

CFIs allow specifying a precise location or range inside any XML/XHTML/HTML document by specifying how to traverse the document tree, e.g:

```
epubcfi(/6/7:42)
```

The above CFI specifies the 42nd character of the 7th child node of the 6th child node of the root node. These can be embellished with additional info e.g:

```
epubcfi(/6[foo]/7:42[don't panic])
```

This lets us know that the `id=` of the 6th child is "foo" and the text at the 42nd character is "don't panic".

Additionally, CFIs can traverse multiple documents, e.g:

```
epubcfi(/1/2!/6[foo]/7:42[don't panic])
```

The `!` marks the beginning of a new document so this CFI tells us to go to the 2nd child node of the 1st child node of the current document, then look for an attribute in that node that references another document (e.g. `href=`) and continue resolving the rest of the CFI in the referenced document.

# ToDo

* Implement CFI generator
* Unit tests for bad data / stuff that should fail

# Other similar projects

## [readium-cfi-js](https://github.com/readium/readium-cfi-js)

Pros of using this project over readium-cfi-js:

* ~20 kB vs. ~400 kB dist file (both numbers for un-minified js)
* Documented usage and example code vs. no documentation on usage
* No dependencies vs. depends on jquery and lodash
* Works with node.js vs. requires browser

Pros of using readium-cfi-js over this project:

* Older more mature project vs. newer unproven codebase
* Includes ability to generate CFIs from node references and offsets
* Has more unit tests

Other differences. This project vs. readium-cfi-js:

* AGPLv3 vs. BSD-3-Clause
* Hand-written state machine vs. uses a parser generator (pegjs)
* Not so strict parsing/resolving vs. strict parsing/resolving

## [epubcfi from epub.js](https://github.com/futurepress/epub.js/blob/master/src/epubcfi.js)

Just from a quick glance at the code it's clear that this implementation will fail in several likely real world scenarios since it uses simple `.split()` calls on characters that can have several meanings depending on where they appear, e.g. '!' and '/' can appear in element `id=` attributes as well as Text Location Assertions but this is not taken into account, neither is the '^' escape character handled at all.

# License and copyright

* License: AGPLv3
* Copyright 2020 Marc Juul Christoffersen 


