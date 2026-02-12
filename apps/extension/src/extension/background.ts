/**
 * Background Service Worker (MV3)
 *
 * Runs in a separate context from the popup and content scripts.
 * Handles message routing between popup and content scripts.
 *
 * Uses webextension-polyfill for Chrome + Firefox compatibility.
 */

import browser from 'webextension-polyfill';

console.log('[Alphonse] Background service worker started');

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as { type: string };
  switch (msg.type) {
    case 'PING':
      return Promise.resolve({ type: 'PONG' });
    default:
      return Promise.resolve({ type: 'ERROR', error: `Unknown type: ${msg.type}` });
  }
});

browser.runtime.onInstalled.addListener((details) => {
  console.log(`[Alphonse] Extension ${details.reason}`);
});
