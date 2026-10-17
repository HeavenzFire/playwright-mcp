'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { validateRequest, isAllowedHttpsUrl } = require('./security');

const HOST = '127.0.0.1';
const PORT = Number(process.env.HF_BROWSER_PORT || 8789);
const TOKEN = process.env.HF_BROWSER_TOKEN || '';
const CDP_URL = process.env.HF_BROWSER_CDP_URL || 'http://127.0.0.1:9222';
const ALLOWED_HOSTS = new Set((process.env.HF_BROWSER_ALLOWED_HOSTS || '')
  .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
const SCREENSHOT_DIR = path.resolve(process.env.HF_BROWSER_SCREENSHOT_DIR || path.join(__dirname, 'screenshots'));
const MAX_BODY_BYTES = 64 * 1024;
let browser = null;
let busy = false;

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body), 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' });
  res.end(body);
}

function authorized(req) {
  const header = req.headers.authorization || '';
  if (!TOKEN) return false;
  const expected = `Bearer ${TOKEN}`;
  return header.length === expected.length && Buffer.from(header).equals(Buffer.from(expected));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

async function getPage() {
  if (!browser || !browser.isConnected()) {
    const { chromium } = require('playwright-core');
    browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
  }
  const contexts = browser.contexts();
  const context = contexts[0] || await browser.newContext();
  return context.pages()[0] || context.newPage();
}

async function performAction(page, action, index) {
  const timeout = 8000;
  switch (action.type) {
    case 'navigate':
      if (!isAllowedHttpsUrl(action.url, ALLOWED_HOSTS)) {
        throw Object.assign(new Error(`Action ${index}: URL not allowed`), { statusCode: 403 });
      }
      await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout });
      return { type: action.type, url: page.url() };
    case 'click':
      await page.locator(action.selector).first().click({ timeout });
      return { type: action.type, clicked: action.selector };
    case 'fill':
      await page.locator(action.selector).first().fill(action.value, { timeout });
      return { type: action.type, filled: action.selector };
    case 'title':
      return { type: action.type, title: await page.title({ timeout }) };
    case 'text': {
      const value = await page.locator(action.selector).first().innerText({ timeout });
      return { type: action.type, text: value.slice(0, action.maxChars || 4000) };
    }
    case 'screenshot': {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const filename = `capture-${new Date().toISOString().replace(/[:.]/g, '-')}-${index}.png`;
      const filepath = path.join(SCREENSHOT_DIR, filename);
      await page.screenshot({ path: filepath, fullPage: false, timeout });
      return { type: action.type, path: filepath };
    }
    default:
      throw Object.assign(new Error(`Action ${index}: unsupported action`), { statusCode: 400 });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { ok: true, service: 'heavenzfire-browser-adapter',
      host: HOST, port: PORT, tokenConfigured: Boolean(TOKEN),
      allowlistConfigured: ALLOWED_HOSTS.size > 0,
      cdpConnected: Boolean(browser && browser.isConnected()), busy });
  }
  if (req.method !== 'POST' || req.url !== '/task') return send(res, 404, { ok: false, error: 'Not found' });
  if (!authorized(req)) return send(res, 401, { ok: false, error: 'Unauthorized' });
  if (!ALLOWED_HOSTS.size) return send(res, 503, { ok: false, error: 'Host allowlist is not configured' });
  if (busy) return send(res, 429, { ok: false, error: 'Browser is busy' });

  let request;
  try {
    request = await readJson(req);
    const validation = validateRequest(request, ALLOWED_HOSTS);
    if (!validation.ok) return send(res, 400, { ok: false, error: validation.error });
  } catch (error) {
    return send(res, error.statusCode || 400, { ok: false, error: error.message });
  }

  busy = true;
  try {
    const page = await getPage();
    const results = [];
    for (let i = 0; i < request.actions.length; i += 1) {
      results.push(await performAction(page, request.actions[i], i + 1));
    }
    return send(res, 200, { ok: true, results });
  } catch (error) {
    return send(res, error.statusCode || 502, { ok: false, error: String(error.message || error).slice(0, 500) });
  } finally {
    busy = false;
  }
});

server.listen(PORT, HOST, () => {
  if (!TOKEN) {
    console.error('Refusing to run without HF_BROWSER_TOKEN. Set a private token and restart.');
    server.close(() => { process.exitCode = 1; });
    return;
  }
  console.log(`HeavenzFire browser adapter listening on http://${HOST}:${PORT}`);
  console.log(`CDP endpoint: ${CDP_URL}`);
  console.log(`Allowed hosts: ${[...ALLOWED_HOSTS].join(', ') || '(none)'}`);
});

function shutdown() {
  if (browser) browser.close().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
