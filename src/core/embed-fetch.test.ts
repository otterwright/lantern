import { afterEach, expect, test, vi } from 'vitest';
import { embedTexts } from './embed';

const transformers = vi.hoisted(() => ({
  env: {} as { cacheDir?: string; fetch?: (input: string) => Promise<Response> },
}));

vi.mock('@huggingface/transformers', () => ({
  env: transformers.env,
  pipeline: async () => async () => ({ data: new Float32Array(384), dims: [1, 384] }),
}));

afterEach(() => vi.unstubAllGlobals());

test('model downloads come back as the current global Response (the server swaps it)', async () => {
  await embedTexts(['load the model']);
  const NodeResponse = Response;
  class ServerResponse extends NodeResponse {}
  vi.stubGlobal('fetch', async () => new NodeResponse('weights', { headers: { 'content-length': '7' } }));
  vi.stubGlobal('Response', ServerResponse);

  const res = await transformers.env.fetch!('https://huggingface.co/model.onnx');

  expect(res).toBeInstanceOf(ServerResponse);
  expect(res.headers.get('content-length')).toBe('7');
  expect(await res.text()).toBe('weights');
});
