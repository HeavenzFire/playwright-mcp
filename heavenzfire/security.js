'use strict';

const ALLOWED_ACTIONS = new Set(['navigate', 'click', 'fill', 'title', 'text', 'screenshot']);
const MAX_ACTIONS = 12;

function isAllowedHttpsUrl(value, allowedHosts) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  return allowedHosts.has(url.hostname.toLowerCase());
}

function validateRequest(request, allowedHosts) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  if (!Array.isArray(request.actions) || request.actions.length < 1 || request.actions.length > MAX_ACTIONS) {
    return { ok: false, error: `actions must contain 1 to ${MAX_ACTIONS} entries` };
  }
  for (let i = 0; i < request.actions.length; i += 1) {
    const action = request.actions[i];
    if (!action || typeof action !== 'object' || Array.isArray(action) || !ALLOWED_ACTIONS.has(action.type)) {
      return { ok: false, error: `actions[${i}] has an unsupported type` };
    }
    if (action.type === 'navigate' && !isAllowedHttpsUrl(action.url, allowedHosts)) {
      return { ok: false, error: `actions[${i}] URL must use HTTPS and an allowlisted hostname` };
    }
    if (['click', 'fill', 'text'].includes(action.type) &&
        (typeof action.selector !== 'string' || !action.selector.trim() || action.selector.length > 500)) {
      return { ok: false, error: `actions[${i}] requires a selector of 1 to 500 characters` };
    }
    if (action.type === 'fill' && (typeof action.value !== 'string' || action.value.length > 10000)) {
      return { ok: false, error: `actions[${i}] fill value must be a string up to 10000 characters` };
    }
    if (action.type === 'text' && action.maxChars !== undefined &&
        (!Number.isInteger(action.maxChars) || action.maxChars < 1 || action.maxChars > 10000)) {
      return { ok: false, error: `actions[${i}] maxChars must be an integer from 1 to 10000` };
    }
    const allowedKeys = {
      navigate: ['type', 'url'], click: ['type', 'selector'],
      fill: ['type', 'selector', 'value'], title: ['type'],
      text: ['type', 'selector', 'maxChars'], screenshot: ['type']
    }[action.type];
    if (Object.keys(action).some((key) => !allowedKeys.includes(key))) {
      return { ok: false, error: `actions[${i}] contains an unsupported property` };
    }
  }
  return { ok: true };
}

module.exports = { isAllowedHttpsUrl, validateRequest, MAX_ACTIONS };
