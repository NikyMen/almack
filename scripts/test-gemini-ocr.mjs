import assert from 'node:assert/strict';
Object.assign(process.env, { DEEPSEEK_API_KEY: 'test' });
Object.assign(process.env, { GEMINI_API_KEY: 'test' });
const { leerRemitoImagen, transcribirImagen } = await import('../src/lib/ai.ts');
const image = { base64: 'aW1hZ2U=', mediaType: 'image/png' };
const calls = [];
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  calls.push({ url, body });
  if (String(url).includes('generativelanguage.googleapis.com')) {
    assert.equal(options.headers['x-goog-api-key'], 'test');
    assert.equal(body.contents[0].parts[1].inline_data.data, image.base64);
    assert.equal(body.contents[0].parts[1].inline_data.mime_type, image.mediaType);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Alfajor 00123 5 100' }] } }] });
  }
  assert.equal(body.thinking.type, 'disabled');
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.max_tokens, 16384);
  assert.ok(body.messages[1].content.includes('Alfajor 00123 5 100'));
  assert.ok(!JSON.stringify(body).includes(image.base64));
  return Response.json({ choices: [{ message: { content: JSON.stringify({ proveedor: 'Prueba', total: 500, items: [{ descripcion: 'Alfajor', codigo: '00123', cantidad: 5, precioUnit: 100 }] }) } }] });
};
const result = await leerRemitoImagen(image);
assert.equal(result.items[0].codigo, '00123');
assert.equal(result.items[0].cantidad, 5);
assert.equal(calls.length, 2);
delete process.env.DEEPSEEK_API_KEY;
await assert.rejects(() => leerRemitoImagen(image), /Falta DEEPSEEK_API_KEY/);
assert.equal(calls.length, 2);
delete process.env.GEMINI_API_KEY;
await assert.rejects(() => transcribirImagen(image), /Falta GEMINI_API_KEY/);
Object.assign(process.env, { GEMINI_API_KEY: 'test' });
globalThis.fetch = async () => Response.json({ candidates: [] });
await assert.rejects(() => transcribirImagen(image), /no encontró texto/);
globalThis.fetch = async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{text: 'parcial'}] } }] });
await assert.rejects(() => transcribirImagen(image), /no completó/);
globalThis.fetch = async () => new Response('sensitive detail', { status: 403 });
await assert.rejects(() => transcribirImagen(image), /Google AI Studio/);
globalThis.fetch = async () => new Response('', { status: 429 });
await assert.rejects(() => transcribirImagen(image), /cuota/);
console.log('Gemini + DeepSeek: flujo y errores OK');

Object.assign(process.env, { DEEPSEEK_API_KEY: 'test' });
const { leerRemitoTexto } = await import('../src/lib/ai.ts');
globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"items":[]}' } }] });
await assert.rejects(() => leerRemitoTexto('prueba'), /límite de respuesta/);

const fallbackCalls = [];
globalThis.fetch = async (url, options) => {
  fallbackCalls.push(String(url));
  if (String(url).includes('generativelanguage')) return new Response('', { status: 503 });
  const body = JSON.parse(options.body);
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.thinking.type, 'disabled');
  assert.ok(body.messages[0].content[1].image_url.url.endsWith(image.base64));
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Alfajor 00123 5 100' } }] });
};
assert.equal(await transcribirImagen(image), 'Alfajor 00123 5 100');
assert.equal(fallbackCalls.length, 2);
globalThis.fetch = async () => new Response('', { status: 401 });
await assert.rejects(() => transcribirImagen(image), /Google AI Studio/);
console.log('Respaldo de visión DeepSeek ante 503 OK');
