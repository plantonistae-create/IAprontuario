// Lab launcher: ONLY pins the listen address to 127.0.0.1:$LAB_PORT, then imports the
// unmodified endpoint. Nothing else in Deno or in the endpoint is replaced.
const port = Number(Deno.env.get('LAB_PORT'));
const target = Deno.env.get('LAB_ENDPOINT') || '';
if (!Number.isInteger(port) || !target.endsWith('/nexa-clinical-text-readback/index.ts')) throw new Error('LAB_CONFIG');
const serve = Deno.serve.bind(Deno);
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (handler: Deno.ServeHandler) => serve({ hostname: '127.0.0.1', port }, handler);
await import('file://' + target);
