A simple parser and resolver for the [EPUB-CFI](http://idpf.org/epub/linking/cfi/epub-cfi.html) format.

This is a work in progress. Not quite usable yet.

This is meant to run in the browser but should work anywhere `DOMParser` is present.

# Usage

Remember to unescape the URI first, then:

```
var cfi = new CFI('epubcfi(/1/2!/1/2/3:4'); // parsing
console.log(cfi.parts); // print parsed data
```

To resolve the CFI, assuming `doc` contains a `Document` or `XMLDocument` object for the starting document:

```
// Use first part of CFI to resolve URI for the second part
var uri = cfi.resolveURI(0, doc);

// Call some function to fetch document for second part of CFI then parse it
var data = fetch(uri);
var parser = new DOMParser();
var doc2 = parser.parseFromString(data, 'text/html');

// Resolve final part of CFI to a bookmark
var bookmark = cfi.resolve(doc2);

// bookmark contains:
{
  node: <reference to html node in doc2>,
  offset: 4
}
```

You can then use e.g. `window.scrollTo()` or some other method to access show the location referenced by the CFI.

# About EPUB-CFI

A CFI, or Canonical Fragment Identifier, is like a more complicated `#anchor` as used in HTML `href=` attributes. Think of them as ebook bookmarks.

CFIs allow specifying a precise location inside any XML/XHTML/HTML document by specifying how to traverse the document tree, e.g:

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

# License and copyright

License: AGPLv3
Copyright 2020 Marc Juul Christoffersen 


