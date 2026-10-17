'use strict';

const assert = require('node:assert/strict');
const { validateRequest, isAllowedHttpsUrl } = require('./security');

const hosts = new Set(['aistudio.google.com', 'ai.studio', 'github.com']);
assert.equal(isAllowedHttpsUrl('https://aistudio.google.com/', hosts), true);
assert.equal(isAllowedHttpsUrl('https://AI.STUDIO/', hosts), true);
assert.equal(isAllowedHttpsUrl('http://github.com/', hosts), false);
assert.equal(isAllowedHttpsUrl('https://github.com.evil.example/', hosts), false);
assert.equal(isAllowedHttpsUrl('https://user:pass@github.com/', hosts), false);
assert.equal(isAllowedHttpsUrl('https://github.com:8443/', hosts), false);
assert.equal(isAllowedHttpsUrl('file:///C:/secret.txt', hosts), false);
assert.equal(validateRequest({ actions: [{ type: 'navigate', url: 'https://aistudio.google.com/' }] }, hosts).ok, true);
assert.equal(validateRequest({ actions: [{ type: 'navigate', url: 'https://example.com/' }] }, hosts).ok, false);
assert.equal(validateRequest({ actions: [{ type: 'fill', selector: '#prompt', value: 'hello' }] }, hosts).ok, true);
assert.equal(validateRequest({ actions: [{ type: 'fill', selector: '#prompt', value: 5 }] }, hosts).ok, false);
assert.equal(validateRequest({ actions: [{ type: 'eval', code: 'process.exit()' }] }, hosts).ok, false);
assert.equal(validateRequest({ actions: [{ type: 'title', unexpected: true }] }, hosts).ok, false);
assert.equal(validateRequest({ actions: [] }, hosts).ok, false);
assert.equal(validateRequest({ actions: Array.from({ length: 13 }, () => ({ type: 'title' })) }, hosts).ok, false);
assert.equal(validateRequest(null, hosts).ok, false);
console.log('PASS: HeavenzFire browser security validation tests');
