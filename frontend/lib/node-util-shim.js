// Node 23+ removed these legacy helpers, but @tensorflow/tfjs-node@4.22 still calls them from its
// native kernel backend (softmax, topK, ...). Must be imported before @vladmandic/face-api / tfjs-node.
import util from 'util';

if (typeof util.isNullOrUndefined !== 'function') {
  util.isNullOrUndefined = (value) => value === null || value === undefined;
}
if (typeof util.isArray !== 'function') {
  util.isArray = Array.isArray;
}
