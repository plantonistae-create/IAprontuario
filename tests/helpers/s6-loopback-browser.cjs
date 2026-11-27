// Optional preload for the WebKit S6 suite. It constrains new contexts to fixtures on loopback.
'use strict';
const Module = require('node:module');
const playwright = require(process.env.NEXA_PLAYWRIGHT_MODULE || 'playwright');
const load = Module._load;
const safe = value => {
  const url = new URL(value);
  return url.protocol === 'http:' && url.hostname === '127.0.0.1' && Boolean(url.port);
};
const constrained = {
  ...playwright,
  webkit: {
    async launch(options) {
      const browser = await playwright.webkit.launch(options);
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (contextOptions = {}) => {
        const context = await newContext({ ...contextOptions, serviceWorkers: 'block',
          proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1' } });
        await context.route('**/*', route => safe(route.request().url()) ? route.continue() : route.abort('blockedbyclient'));
        await context.routeWebSocket('**/*', socket => socket.close());
        return context;
      };
      browser.newPage = async options => {
        const context = await browser.newContext(options);
        const page = await context.newPage();
        page.once('close', () => context.close().catch(() => {}));
        return page;
      };
      return browser;
    },
  },
};
Module._load = function (name, ...args) {
  if (name === 'playwright') return constrained;
  return load.call(this, name, ...args);
};
