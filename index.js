/**
 * @typedef {Document | XMLDocument} Doc
 */

/**
 * @typedef {{ node: Node; offset: number; relativeToNode?: 'before' | 'after' }} CFIIndexedObject
 */
  
/**
 * @typedef {SubPart[]} FromTo
 */

const { ELEMENT_NODE, TEXT_NODE, CDATA_SECTION_NODE } = (() => {
  let ELEMENT_NODE = 1;
  let TEXT_NODE = 3;
  let CDATA_SECTION_NODE = 4;

  // If using node.js
  if (typeof Node === 'undefined') {
    ELEMENT_NODE = 1;
    TEXT_NODE = 3;
    CDATA_SECTION_NODE = 4;
  } 
  // In the browser
  else { 
    ELEMENT_NODE = Node.ELEMENT_NODE;
    TEXT_NODE = Node.TEXT_NODE;
    CDATA_SECTION_NODE = Node.CDATA_SECTION_NODE;
  }

  return {
    ELEMENT_NODE,
    TEXT_NODE,
    CDATA_SECTION_NODE,
  }
})();

/**
 * @param {string} str 
 * @returns {string}
 */
function cfiEscape(str) {
  return str.replace(/[\[\]\^,();]/g, "^$&");
}

/**
 * Get indices of all matches of regExp in str
 * if `add` is non-null, add it to the matched indices

 * @param {string} str 
 * @param {RegExp} regExp 
 * @param {number} add 
 * @returns 
 */
function matchAll(str, regExp, add) {
  add = add ?? 0;

  let matches = [];
  let offset = 0;

  do {
    const m = str.match(regExp);
    if (!m) break;

    matches.push(m.index + add);
    offset += m.index + m.length;
    str = str.slice(m.index + m.length);
  } while(offset < str.length);

  return matches;
}

/**
 * Get the number in a that has the smallest diff to n
 * @param {number[]} a 
 * @param {number} n 
 * @returns {number | undefined}
 */
function closest(a, n) {
  let minDiff = Infinity;
  /** @type {number} */
  let diff;
  /** @type {number | undefined} */
  let closest = undefined;

  for (let i=0; i < a.length; i++) {
    diff = Math.abs(a[i] - n);
    if (!i || diff < minDiff) {
      diff = minDiff; // ??
      closest = a[i];
    }
  }

  return closest;
}

/**
 * Given a set of nodes that are all children and a reference to one of those 
 * nodes, calculate the count/index of the node according to the CFI spec.
 * Also re-calculate offset if supplied and relevant
 * 
 * @param {NodeListOf<Element>} nodes 
 * @param {Element} n 
 * @param {number} offset 
 * @returns {{count: number; offset?: number}}
 */
function calcSiblingCount(nodes, n, offset) {
  let count = 0;
  let lastWasElement = false;
  let prevOffset = 0;
  let firstNode = true;

  for (let i=0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.nodeType === ELEMENT_NODE) {
      if (lastWasElement || firstNode) {
        count += 2;
        firstNode = false;
      } else {
        count++;
      }
      
      if (n === node) {
        if (node.tagName.toLowerCase() === 'img') {
          return { count, offset };
        } else {
          return { count };
        }
      }
      prevOffset = 0;
      lastWasElement = true;
    } else if (node.nodeType === TEXT_NODE ||
               node.nodeType === CDATA_SECTION_NODE) {
      if (lastWasElement || firstNode) {
        count++;
        firstNode = false;
      }
      
      if (n === node) {
        return { count, offset: offset + prevOffset };
      }

      prevOffset += (node.textContent ?? '').length;
      lastWasElement = false;
    } else {
      continue;
    }
  }

  throw new Error("The specified node was not found in the array of siblings");
}

/**
 * 
 * @param {number | unknown} a 
 * @param {number | unknown} b 
 * @returns {number}
 */
function compareTemporal(a, b) {
  //const isA = (typeof a === 'number');
  //const isB = (typeof b === 'number');

  /**
   * @param {unknown} x 
   * @returns {x is number}
   */
  function isNumber(x) { 
    return typeof x === 'number';
  }
  const isA = isNumber(a);
  const isB = isNumber(b);

  if (isA && isB) {
    return (a || 0.0) - (b || 0.0);
  }

  else if (!isA && isB) return -1;
  else if (isA && !isB) return 1;
  // (!isA && !isB)
  else return 0;
}

function compareSpatial(a, b) {
  if (!a && !b) return 0;
  if (!a && b) return -1;
  if (a && !b) return 1;

  let diff = (a.y || 0) - (b.y || 0);
  if (diff) return diff;

  return (a.x || 0) - (b.x || 0);
}

/**
 * @typedef {{
 *     nodeIndex: number;
 *     offset?: number;
 *     spatial?: {
 *       x: number;
 *       y: number;
 *     } | undefined;
 *     temporal?: number;
 *     textLocationAssertion?: {
 *       pre: string;
 *       post?: string;
 *     } | string;
 *     sideBias?: 'before' | 'after';
 *     nodeID: string | null | undefined;
 * }} SubPart
 * 
 * @typedef {SubPart[]} Part
 */
class CFI {

  /**
   * @param {string} str 
   * @param {unknown} [opts]
   */
  constructor(str, opts) {
    this.opts = Object.assign({
      // If CFI is a Simple Range, pretend it isn't
      // by parsing only the start of the range
      flattenRange: false,
      // Strip temporal, spatial, offset and textLocationAssertion
      // from places where they don't make sense
      stricter: true
    }, opts || {});
    
    /** @type {string} */
    this.cfi = str;
    const isCFI = new RegExp(/^epubcfi\((.*)\)$/);
    
    str = str.trim();
    let m = str.match(isCFI);
    if (!m) throw new Error("Not a valid CFI");
    if (m.length < 2) return; // Empty CFI

    str = m[1];
    /** @type {Part[]} */
    this.parts = [];

    /** @type {SubPart[]} */
    let subParts = [];
    let sawComma = 0;
    while (str.length) {
      const { parsed, offset, newDoc } = this.parse(str);

      if (!parsed || offset === null) throw new Error("Parsing failed");
      if (sawComma && newDoc) throw new Error("CFI is a range that spans multiple documents. This is not allowed");
      
      subParts.push(parsed);

      // Handle end of string
      if (newDoc || str.length - offset <= 0) {
        // Handle end if this was a range
        if (sawComma === 2) {
          /** @type {SubPart[]} */
          this.to = subParts;
        } else { // not a range
          this.parts.push(subParts);
        }
        subParts = [];
      }
      
      str = str.slice(offset);
      
      // Handle Simple Ranges
      if (str[0] === ',') {
        if (sawComma === 0) {
          if (subParts.length) {
            this.parts.push(subParts);
          }
          subParts = [];
        } else if (sawComma === 1) {
          if (subParts.length) {
            /** @type {SubPart[]} */
            this.from = subParts;
          }
          subParts = [];
        }
        str = str.slice(1);
        sawComma++;
      }
    }

    if (this.from && this.from.length) {
      if (this.opts.flattenRange || !this.to || !this.to.length) {
        this.parts = this.parts.concat(this.from);
        delete this.from;
        delete this.to;
      } else {
        /** @type {boolean} */
        this.isRange = true;
      }
    }

    if (this.opts.stricter) {
      this.removeIllegalOpts();
    }
  }

  /**
   * 
   * @param {Part[] | undefined} parts
   * @returns 
   */
  removeIllegalOpts(parts = undefined) {
    if (!parts) {
      if (this.from) {
        this.removeIllegalOpts(this.from);
        if (!this.to) return;
        parts = this.to;
      } else {
        parts = this.parts;
      }
    }

    for (let i=0; i < parts.length; i++) {
      const part = parts[i];
      for (let j=0; j < part.length - 1; j++) {
        const subpart = part[j];
        delete subpart.temporal;
        delete subpart.spatial;
        delete subpart.offset;
        delete subpart.textLocationAssertion;
      }
    }
  }

  /**
   * 
   * @param {Node} node 
   * @param {number} [offset]
   * @param {*} [extra]
   * @returns {string}
   */
  static generatePart(node, offset, extra) {
    let cfi = '';

    // The leading path of CFI corresponding to the 'spine' element must be relative 
    // to the ancestor 'package' element. If this is a spine child element, we need
    // to stop traversing when we reach the 'package' node.  
    let isSpineElement = node.parentNode?.nodeName === 'spine' ? true : false;

    while (node.parentNode) {
      const o = calcSiblingCount(node.parentNode.childNodes, node, offset);
      if (!cfi && o.offset) cfi = ':' + o.offset;
      
      cfi = '/' + o.count + (/** @type {Element} */(node).id ? `[${cfiEscape(node.id)}]` : '') + cfi;
      
      node = node.parentNode;

      if (isSpineElement && node.nodeName === 'package'){
        break;
      }
    }
    
    return cfi;
  }
  
  /**
   * Generate CFI string from node and offset.
   * 
   * @param {Node | { node: Node, offset?: number }[]} node 
   * @param {number} [offset]
   * @param {unknown} [extra]
   * @returns {string}
   */
  static generate(node, offset, extra) {
    let cfi;
    
    if (node instanceof Array) {
      let strs = [];
      for (let o of node) {
        strs.push(this.generatePart(o.node, o.offset));
      }
      cfi = strs.join('!');
    } else {
      cfi = this.generatePart(node, offset, extra);
    }

    if (extra) cfi += extra;
    
    return `epubcfi(${cfi})`;
  }

  /**
   * 
   * @this {CFI}
   * @param {string | CFI} cfi 
   * @returns 
   */
  static toParsed(cfi) {
    //if (typeof cfi === 'string') cif = new this(cfi); // ??
    const instance = typeof cfi === 'string' ? new CFI(cfi) : cfi;

    if (instance.isRange) {
      return instance.getFrom();
    } else {
      return instance.get();
    }
  }

  /**
   * Takes two CFI paths and compares them
   * @param {FromTo} a 
   * @param {FromTo} b 
   * @returns 
   */
  static comparePath(a, b) {
    const max = Math.max(a.length, b.length);
    
    for (let i=0; i < max; i++) {
      const cA = a[i];
      const cB = b[i];
      if (!cA) return -1;
      if (!cB) return 1;

      const diff = this.compareParts(cA, cB);
      if (diff) return diff;
    }
    return 0;
  }

  /**
   * Sort an array of CFI objects
   * @param {CFI[]} a 
   */
  static sort(a) {
    a.sort((a, b) => {
      return this.compare(a, b)
    });
  }
  
  /**
   * Takes two CFI objects and compares them.
   * @param {CFI} a 
   * @param {CFI} b 
   * @returns 
   */
  static compare(a, b) {
    let oA = a.get();
    let oB = b.get();
    if (a.isRange || b.isRange) {
      if (a.isRange && b.isRange) {
        let diff = this.comparePath(oA.from, oB.from);
        if (diff) return diff;
        return this.comparePath(oA.to, oB.to);
      }
      if (a.isRange) oA = oA.from;
      if (b.isRange) oB = oB.from;

      return this.comparePath(oA, oB);
    } else { // neither a nor b is a range
      return this.comparePath(oA, oB);
    }
  }
  
  /**
   * Takes two parsed path parts (assuming path is split on '!') and compares them.
   * @param {Part} a 
   * @param {Part} b 
   * @returns {number}
   */
  static compareParts(a, b) {
    const max = Math.max(a.length, b.length);
    
    for (let i = 0; i < max; i++) {
      const cA = a[i];
      const cB = b[i];
      if (!cA) return -1;
      if (!cB) return 1;
      
      let diff = cA.nodeIndex - cB.nodeIndex;
      if (diff) return diff;

      // The paths must be equal if the "before the first node" syntax is used
      // and this must be the last subpart (assuming a valid CFI)
      if (cA.nodeIndex === 0) {
        return 0;
      }
      
      // Don't bother comparing offsets, temporals or spatials
      // unless we're on the last element, since they're not
      // supposed to be on elements other than the last
      if (i < max - 1) continue;
      
      // Only compare spatials or temporals for element nodes
      if (cA.nodeIndex % 2 === 0) {
        diff = compareTemporal(cA.temporal, cB.temporal);
        if (diff) return diff;
        
        diff = compareSpatial(cA.spatial, cB.spatial);
        if (diff) return diff;
      }

      diff = (cA.offset || 0) - (cB.offset || 0);
      if (diff) return diff;
    }
    return 0;
  }
  
  /**
   * @param {Doc} dom 
   * @param {string} str 
   * @returns {string}
   */
  decodeEntities(dom, str) {
    try {
      const el = dom.createElement('textarea');
      el.innerHTML = str;
      return el.value
    } catch(err) {
      // TODO fall back to simpler decode?
      // e.g. regex match for stuff like &#160; and &nbsp;
      return str; 
    }
  }
  
  /**
   * decode HTML/XML entities and compute length
   * @param {Doc} dom 
   * @param {string} str 
   * @returns {number}
   */
  trueLength(dom, str) {
    return this.decodeEntities(dom, str).length;
  }
  
  /**
   * @returns 
   */
  getFrom() {
    if (!this.isRange) throw new Error("Trying to get beginning of non-range CFI");

    if (!this.from) {
      return this.deepClone(this.parts);
    }
    const parts = this.deepClone(this.parts);
    parts[parts.length-1] = parts[parts.length-1].concat(this.from);
    return parts;
  }

  getTo()  {
    if (!this.isRange) throw new Error("Trying to get end of non-range CFI");
    const parts = this.deepClone(this.parts);
    parts[parts.length-1] = parts[parts.length-1].concat(this.to);
    return parts
  }
  
  /**
   * 
   * @returns {Part[]}
   */
  get() {
    if (this.isRange) {
      return {
        from: this.getFrom(),
        to: this.getTo(),
        isRange: true
      };
    }
    return this.deepClone(this.parts);
  }
  
  /**
   * 
   * @param {SubPart} o 
   * @param {string | null} loc 
   * @returns 
   */
  parseSideBias(o, loc) {
    if (!loc) return;

    const m = loc.trim().match(/^(.*);s=([ba])$/);
    if (!m || m.length < 3) {
      if (typeof o.textLocationAssertion === 'object') {
        o.textLocationAssertion.post = loc;
      } else {
        o.textLocationAssertion = loc;
      }
      return;
    }
    if (m[1]) {
      if (typeof o.textLocationAssertion === 'object') {
        o.textLocationAssertion.post = m[1];
      } else {
        o.textLocationAssertion = m[1];
      }
    }
    
    if (m[2] === 'a') {
      o.sideBias = 'after';
    } else {
      o.sideBias = 'before';
    }
  }
  
  parseSpatialRange(range) {
    if (!range) return undefined;
    const m = range.trim().match(/^([\d\.]+):([\d\.]+)$/);
    if (!m || m.length < 3) return undefined;
    const o = {
      x: parseInt(m[1]),
      y: parseInt(m[2]),
    };
    if (typeof o.x !== 'number' || typeof o.y !== 'number') {
      return undefined;
    }
    return o;
  }
  
  /**
   * @param {string} cfi 
   * @returns {{ parsed: SubPart, offset: number, newDoc: boolean }}
   */
  parse(cfi) {
    let o = {};
    const isNumber = new RegExp(/[\d]/);

    /** @type {string | null} */
    let f = null;
    let state;
    let prevState;
    let escape;
    let seenColon = false;
    let seenSlash = false;
    let index;

    for (index=0; index <= cfi.length; index++) {
      const cur = index < cfi.length ? cfi[index] : '';

      if (cur === '^' && !escape) {
        escape = true;
        continue;
      }

      if (state === '/') {
        if (cur.match(isNumber)) {
          if (!f) {
            f = cur;
          } else {
            f += cur;
          }
          escape = false;
          continue;
        } else {
          if (f) {
            o.nodeIndex = parseInt(f);
            f = null;
          }
          prevState = state;
          state = null;
        }
      }
      
      if (state === ':') {
        if (cur.match(isNumber)) {
          if (!f) {
            f = cur;
          } else {
            f += cur;
          }
          escape = false;
          continue;
        } else {
          if (f) {
            o.offset = parseInt(f);
            f = null;
          }
          prevState = state;
          state = null;
        }
      }

      if (state === '@') {
        let done = false;
        if (cur.match(isNumber) || cur === '.' || cur === ':') {
          if (cur === ':') {
            if (!seenColon) {
              seenColon = true;
            } else {
              done = true;
            }
          }
        } else {
          done = true;
        }
        if (!done) {
          if (!f) {
            f = cur;
          } else {
            f += cur;
          }
          escape = false;
          continue;
        } else {
          prevState = state;
          state = null;
          if (f && seenColon) o.spatial = this.parseSpatialRange(f);
          f = null;
        }
      }
      
      if (state === '~' ) {
        if (cur.match(isNumber) || cur === '.') {
          if (!f) {
            f = cur;
          } else {
            f += cur;
          }
          escape = false;
          continue;
        } else {
          if (f) {
            o.temporal = parseFloat(f);
          }
          prevState = state;
          state = null;
          f = null;
        }
      }
      
      if (!state) {
        if (cur === '!') {
          index++;
          state = cur;
          break;
        }

        if (cur === ',') {
          break;
        }
        
        if (cur === '/') {
          if (seenSlash) {
            break;
          } else {
            seenSlash = true;
            prevState = state;
            state = cur;
            escape = false;
            continue;
          }
        }
        
        if (cur === ':' || cur === '~' || cur === '@') {
          if (this.opts.stricter) {
            // We've already had a temporal or spatial indicator
            // and offset does not make sense and the same time
            if (cur === ':' && (typeof o.temporal !== 'undefined' || typeof o.spatial !== 'undefined')) {
              break;
            }
            // We've already had an offset
            // and temporal or spatial do not make sense at the same time
            if ((cur === '~' || cur === '@') && (typeof o.offset !== 'undefined')) {
              break;
            }
          }
          prevState = state;
          state = cur;
          escape = false;
          seenColon = false; // only relevant for '@'
          continue;
        }        

        if (cur === '[' && !escape && prevState === ':') {
          prevState = state;
          state = '[';
          escape = false;
          continue;
        }

        if (cur === '[' && !escape && prevState === '/') {
          prevState = state;
          state = 'nodeID';
          escape = false;
          continue;
        }
      }


      if (state === '[') {
        if (cur === ']' && !escape) {
          prevState = state;
          state = null;
          this.parseSideBias(o, f);
          f = null;
        } else if (cur === ',' && !escape) {
          o.textLocationAssertion = {};
          if (f) {
            o.textLocationAssertion.pre = f;
          }
          f = null;
        } else {
          if (!f) {
            f = cur;
          } else {
            f += cur;
          }
        }
        escape = false;
        continue;
      }

      if (state === 'nodeID') {
        if (cur === ']' && !escape) {
          prevState = state;
          state = null;
          o.nodeID = f;
          f = null;
        } else {
          if (!f) {
            f = cur;
          } else {
            f += cur;
          }
        }
        escape = false;
        continue;
      }
      
      escape = false;
    }
    
    if (!o.nodeIndex && o.nodeIndex !== 0) throw new Error("Missing child node index in CFI");
    
    return { parsed: o, offset: index, newDoc: (state === '!') };
  }

  /**
   * The CFI counts child nodes differently from the DOM
   * Retrive the child of parentNode at the specified index
   * according to the CFI standard way of counting
   * @param {Doc} dom 
   * @param {Node} parentNode 
   * @param {number} index 
   * @param {number} offset 
   * @returns {CFIIndexedObject | undefined}
   */
  getChildNodeByCFIIndex(dom, parentNode, index, offset) {
    const children = parentNode.childNodes;
    if (!children.length) return {node: parentNode, offset: 0};

    // index is pointing to the virtual node before the first node
    // as defined in the CFI spec
    if (index <= 0) {
      return {node: children[0], relativeToNode: 'before', offset: 0 };
    }
      
    let cfiCount = 0;
    let lastChild;
    for (let i=0; i < children.length; i++) {
      const child = children[i];
      switch(child.nodeType) {
      case ELEMENT_NODE:

        // If the previous node was also an element node
        // then we have to pretend there was a text node in between
        // the current and previous nodes (according to the CFI spec)
        // so we increment cfiCount by two
        if (cfiCount % 2 === 0) {
          cfiCount += 2;
          if (cfiCount >= index) {
            if (/** @type {Element} */(child).tagName.toLowerCase() === 'img' && offset) {
              return { node: child, offset };
            }
            return { node: child, offset: 0 };
          }
        } else { // Previous node was a text node
          cfiCount += 1;
          if (cfiCount === index) {
            if (/** @type {Element} */(child).tagName.toLowerCase() === 'img' && offset) {
              return { node: child, offset };
            }
              
            return { node: child, offset: 0 };

            // This happens when offset into the previous text node was greater
            // than the number of characters in that text node
            // So we return a position at the end of the previous text node
          } else if (cfiCount > index) {
            if (!lastChild) {
              return { node: parentNode, offset: 0 };
            }
            return { node: lastChild, offset: this.trueLength(dom, lastChild.textContent ?? '') };
          }
        }
        lastChild = child;
        break;
      case TEXT_NODE:
      case CDATA_SECTION_NODE:
        // If this is the first node or the previous node was an element node
        if (cfiCount === 0 || cfiCount % 2 === 0) {
          cfiCount += 1;
        } else {
          // If previous node was a text node then they should be combined
          // so we count them as one, meaning we don't increment the count
        }

        if (cfiCount === index) {
          // If offset is greater than the length of the current text node
          // then we assume that the next node will also be a text node
          // and that we'll be combining them with the current node
          let trueLength = this.trueLength(dom, child.textContent ?? '');

          if (offset >= trueLength) {
            offset -= trueLength;
          } else {
            return { node: child, offset: offset }
          }
        }
        lastChild = child;
        break;
      default:
        continue
      }
    }

    // index is pointing to the virtual node after the last child
    // as defined in the CFI spec
    if (index > cfiCount) {
      const o = { 
        node: lastChild || parentNode,
        offset: 0,
        relativeToNode: /** @type {'after'} */ ('after'),
      };

      if (!lastChild) {
        o.node = parentNode;
      } else {
        o.node = lastChild;
      }

      if (this.isTextNode(o.node)) {
        o.offset = this.trueLength(dom, String(((o.node.textContent ?? '').length))); // ??
      }

      return o;
    }  
  }

  /**
   * @param {Node | null | undefined} node 
   * @returns {node is Text}
   */
  isTextNode(node) {
    if (!node) return false;
    if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE) {
      return true;
    }
    return false;
  }

  /**
   * Use a Text Location Assertion to correct and offset
   * @param {Doc} dom 
   * @param {Node} node 
   * @param {number} offset 
   * @param {string | {pre: string; post: string}} assertion 
   * @returns 
   */
  correctOffset(dom, node, offset, assertion) {
    let curNode = node;

    let matchStr = '';
    if (typeof assertion === 'string') {
      matchStr = this.decodeEntities(dom, assertion);
    } else {
      assertion.pre = this.decodeEntities(dom, assertion.pre);
      assertion.post = this.decodeEntities(dom, assertion.post);
      matchStr = assertion.pre + '.' + assertion.post;
    }

    if (!(this.isTextNode(node))) {
      return { node, offset: 0 };
    }
    
    while (this.isTextNode(curNode.previousSibling)) {
      curNode = curNode.previousSibling;
    }

    const startNode = curNode;
    const nodeLengths = [];
    let str;
    let txt = '';
    let i = 0;
    while (this.isTextNode(curNode)) {
      str = this.decodeEntities(dom, curNode.textContent ?? '');
      nodeLengths[i] = str.length;
      txt += str;
      
      if (!curNode.nextSibling) break;
      curNode = curNode.nextSibling;
      i++;
    }

    // Find all matches to the Text Location Assertion
    const matchOffset = (typeof assertion !== 'string' && 'pre' in assertion) ? assertion.pre.length : 0;
    const m = matchAll(txt, new RegExp(matchStr), matchOffset);
    if (!m.length) return { node, offset };
    
    // Get the match that has the closest offset to the existing offset
    let newOffset = /** @type {number} */(closest(m, offset));
    
    if (curNode === node && newOffset === offset) {
      return {node, offset};
    }

    i = 0;
    curNode = startNode;
    while (newOffset >= nodeLengths[i]) {

      newOffset -= nodeLengths[i];
      if (newOffset < 0) return {node, offset}

      if (!curNode.nextSibling || i+1 >= nodeOffsets.length) // ??
        return { node, offset };
      i++;
      curNode = curNode.nextSibling;
    }

    return { node: curNode, offset: newOffset };
  }
  
  /**
   * 
   * @param {number} index 
   * @param {*} subparts 
   * @param {Doc} dom 
   * @param {*} [opts]
   * @returns 
   */
  resolveNode(index, subparts, dom, opts) {
    opts = Object.assign({}, opts || {});
    if (!dom) throw new Error("Missing DOM argument");
    
    // Traverse backwards until a subpart with a valid ID is found
    // or the first subpart is reached
    let startNode;
    if (index === 0) {
      startNode = dom.querySelector('package');
    }
    
    if (!startNode) {
      for (let n of dom.childNodes) {
        if (n.nodeType === ELEMENT_NODE) {
          startNode = n;
          break;
        }
      }
    }
    if (!startNode) throw new Error("Doc incompatible with CFIs");

    /** @type {Node | null} */
    let node = startNode;

    let startFrom = 0;
    let subpart;
    for (let i=subparts.length-1; i >=0; i--) {
      subpart = subparts[i];
      if (!opts.ignoreIDs && subpart.nodeID && (node = dom.getElementById(subpart.nodeID))) {
        startFrom = i + 1;
        break;
      }
    }

    if (!node) {
      node = startNode;
    }
    
    /** @type {CFIIndexedObject} */
    let o = {node, offset: 0};
    
    let nodeIndex;
    for (let i=startFrom; i < subparts.length; i++) {
      subpart = subparts[i];

      o = this.getChildNodeByCFIIndex(dom, o.node, subpart.nodeIndex, subpart.offset);

      if (subpart.textLocationAssertion) {
        o = this.correctOffset(dom, o.node, subpart.offset, subpart.textLocationAssertion);
      }
    }
    
    return o;
  }
  
  // Each part of a CFI (as separated by '!')
  // references a separate HTML/XHTML/XML document.
  // This function takes an index specifying the part
  // of the CFI and the appropriate Doc or XMLDocument
  // that is referenced by the specified part of the CFI
  // and returns the URI for the document referenced by
  // the next part of the CFI
  // If the opt `ignoreIDs` is true then IDs
  // will not be used while resolving
  resolveURI(index, dom, opts) {
    opts = opts || {};
    if (index < 0 || index > this.parts.length - 2) {
      throw new Error("index is out of bounds");
    }

    const subparts = this.parts[index];
    if (!subparts) throw new Error("Missing CFI part for index: " + index);
    
    let o = this.resolveNode(index, subparts, dom, opts);
    
    let node = /** @type {Element} */ (o.node);

    const tagName = node.tagName.toLowerCase();
    if (tagName === 'itemref'
       && /** @type {Element} */(node.parentNode).tagName.toLowerCase() === 'spine') {

      const idref = node.getAttribute('idref');
      if (!idref) throw new Error("Referenced node had not 'idref' attribute");
      node = dom.getElementById(idref);
      if (!node) throw new Error("Specified node is missing from manifest");
      const href = node.getAttribute('href');
      if (!href) throw new Error("Manifest item is missing href attribute");
      
      return href;
    }

    if (tagName === 'iframe' || tagName === 'embed') {
      const src = node.getAttribute('src');
      if (!src) throw new Error(tagName + " element is missing 'src' attribute");
      return src;
    }

    if (tagName === 'object') {
      const data = node.getAttribute('data');
      if (!data) throw new Error(tagName + " element is missing 'data' attribute");
      return data;
    }

    if (tagName === 'image'|| tagName === 'use') {
      const href = node.getAttribute('xlink:href');
      if (!href) throw new Error(tagName + " element is missing 'xlink:href' attribute");
      return href;
    }

    throw new Error("No URI found");
  }

  /**
   * @template T
   * @param {T} o 
   * @returns {T}
   */
  deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  /**
   * 
   * @param {Doc} dom 
   * @param {*} parts 
   * @returns 
   */
  resolveLocation(dom, parts) {
    const index = parts.length - 1;
    const subparts = parts[index];
    if (!subparts) throw new Error("Missing CFI part for index: " + index);

    let o = this.resolveNode(index, subparts, dom);
    
    let lastpart = this.deepClone(subparts[subparts.length - 1]);
    
    delete lastpart.nodeIndex;
    if (!lastpart.offset) delete o.offset;
    
    Object.assign(lastpart, o);
    
    return lastpart;    
  }
  
  /**
   * Takes the Doc or XMLDocument for the final
   * document referenced by the CFI
   * and returns the node and offset into that node
   * 
   * @param {Doc} dom 
   * @param {*} opts 
   * @returns 
   */
  resolveLast(dom, opts) {
    opts = Object.assign({
      range: false
    }, opts || {});
    
    if (!this.isRange) {
      return this.resolveLocation(dom, this.parts);
    }

    if (opts.range) {
      const range = dom.createRange();
      const from = this.getFrom();
      if (from.relativeToNode === 'before') {
        range.setStartBefore(from.node, from.offset)
      } else if (from.relativeToNode === 'after') {
        range.setStartAfter(from.node, from.offset)
      } else {
        range.setStart(from.node, from.offset);
      }

      const to = this.getTo();
      if (to.relativeToNode === 'before') {
        range.setEndBefore(to.node, to.offset)
      } else if (to.relativeToNode === 'after') {
        range.setEndAfter(to.node, to.offset)
      } else {
        range.setEnd(to.node, to.offset);
      }

      return range;
    }
    
    return {
      from: this.resolveLocation(dom, this.getFrom()),
      to: this.resolveLocation(dom, this.getTo()),
      isRange: true
    };
  }

  async fetchAndParse(uri) {
    return new Promise((resolv, reject) => {
      
      const xhr = new XMLHttpRequest;
      
      xhr.open('GET', uri);
      xhr.responseType = 'document';
      
      xhr.onload = function() {
        if (xhr.readyState === xhr.DONE) {
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error("Failed to get: " + uri));
            return;
          }
          resolv(xhr.responseXML);
        }
      }
      xhr.onerror = function() {
        reject(new Error("Failed to get: " + uri));
      }
      
      xhr.send();
    });
  }
  
  /**
   * 
   * @param {string | Doc} uriOrDoc 
   * @param {((uri: string) => Promise<Doc>) | null} [fetchCB]
   * @param {*} [opts]
   * @returns 
   */
  async resolve(uriOrDoc, fetchCB, opts) {
    if (typeof fetchCB !== 'function') {
      opts = fetchCB;
      fetchCB = null
    }
    if (!fetchCB) {
      if (typeof XMLHttpRequest === 'undefined') {
        throw new Error("XMLHttpRequest not available. You must supply a function as the second argument.");
      }
      fetchCB = this.fetchAndParse;
    }
    
    /** @type {string | undefined} */
    let uri;
    /** @type {Doc | undefined} */
    let doc;
    if (typeof uriOrDoc === 'string') {
      uri = uriOrDoc;
    } else {
      doc = uriOrDoc;
    }

    let part; // ??
    for (let i=0; i < this.parts.length - 1; i++) {
      if (uri) doc = await fetchCB(uri);
      uri = this.resolveURI(i, doc, opts);
    }

    if (uri) doc = await fetchCB(uri);
    return this.resolveLast(/** @type {Doc} */(doc), opts);
  }
}

export default CFI;
