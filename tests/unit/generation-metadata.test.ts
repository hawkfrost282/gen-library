import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { parseGenerationMetadata } from '../../src/worker/generation-metadata-parser';
import { readGenerationMetadata, readPngTextMetadata } from '../../src/worker/generation-metadata-reader';

const roots: string[] = [];
function png(chunks: Array<[string, Buffer]>) {
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), ...chunks.map(([kind, data]) => {
    const header = Buffer.alloc(8); header.writeUInt32BE(data.length); header.write(kind, 4);
    // Metadata reader never decodes pixels and does not depend on CRCs.
    return Buffer.concat([header, data, Buffer.alloc(4)]);
  })]);
}
function fixture(data: Buffer) {
  const root = mkdtempSync(path.resolve('.local/metadata-test-')); roots.push(root);
  const file = path.join(root, 'image.png'); writeFileSync(file, data); return file;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('generation metadata', () => {
  it('extracts ComfyUI conditioning, model, LoRA and settings without rounding large seeds', () => {
    const graph = '{"1":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"model.safetensors"}},"2":{"class_type":"CLIPTextEncode","inputs":{"text":"a red panda"}},"3":{"class_type":"CLIPTextEncode","inputs":{"text":"blurry"}},"4":{"class_type":"LoraLoader","inputs":{"lora_name":"fur.safetensors"}},"5":{"class_type":"EmptyLatentImage","inputs":{"width":1024,"height":768}},"6":{"class_type":"KSampler","inputs":{"positive":["2",0],"negative":["3",0],"seed":18446744073709551615,"steps":30,"cfg":7,"sampler_name":"euler","scheduler":"normal"}}}';
    expect(parseGenerationMetadata({ prompt: graph })).toMatchObject({ source: 'ComfyUI', prompt: 'a red panda', negativePrompt: 'blurry', models: ['model.safetensors'], loras: ['fur.safetensors'], seed: '18446744073709551615', steps: '30', width: '1024', height: '768' });
  });
  it('preserves long AUTOMATIC1111 prompts and parses LoRAs and generation settings', () => {
    const prompt = `${'long prompt '.repeat(1000)}<lora:Ink:0.8>`;
    expect(parseGenerationMetadata({ parameters: `${prompt}\nNegative prompt: artifacts\nSteps: 25, Sampler: DPM++ 2M, CFG scale: 6, Seed: 123, Size: 768x1024, Model: illustration` })).toMatchObject({ prompt, negativePrompt: 'artifacts', models: ['illustration'], loras: ['Ink'], seed: '123', steps: '25', width: '768', height: '1024' });
  });
  it('reads Draw Things JSON comments and does not invent missing fields', () => {
    const value = parseGenerationMetadata({ Software: 'Draw Things', UserComment: `ASCII\0\0\0${JSON.stringify({ prompt: 'library', negative_prompt: 'text', model: { name: 'Flux' }, loras: [{ file: 'paper' }], seed: 9 })}` });
    expect(value).toMatchObject({ source: 'Draw Things', prompt: 'library', models: ['Flux'], loras: ['paper'], steps: null });
    expect(parseGenerationMetadata({ Software: 'Camera', Description: 'Holiday' })).toBeNull();
  });
  it('handles cyclic ComfyUI links without recursive runaway', () => {
    expect(() => parseGenerationMetadata({ prompt: JSON.stringify({ '1': { class_type: 'KSampler', inputs: { positive: ['2',0], seed: 1 } }, '2': { class_type: 'Conditioning', inputs: { conditioning: ['2',0] } } }) })).not.toThrow();
  });
  it('reads compressed PNG metadata without decoding image pixels', async () => {
    const parameters = 'forest\nSteps: 20, Seed: 10, Model: demo';
    const file = fixture(png([['zTXt', Buffer.concat([Buffer.from('parameters\0\0'), deflateSync(parameters)])]]));
    expect(await readGenerationMetadata(file)).toMatchObject({ prompt: 'forest', seed: '10' });
  });
  it('ignores compressed metadata bombs and malformed chunks', async () => {
    const file = fixture(png([['zTXt', Buffer.concat([Buffer.from('parameters\0\0'), deflateSync(Buffer.alloc(5 * 1024 * 1024, 65))])], ['tEXt', Buffer.from('comment\0safe')]]));
    expect(await readPngTextMetadata(file)).toEqual({ comment: 'safe' });
    expect(await readGenerationMetadata(file)).toBeNull();
  });
  it('bounds the sum of decompressed text chunks', async () => {
    const value = deflateSync(Buffer.alloc(3 * 1024 * 1024, 65));
    const file = fixture(png(Array.from({ length: 6 }, (_, i) => ['zTXt', Buffer.concat([Buffer.from(`chunk${i}\0\0`), value])])));
    const metadata = await readPngTextMetadata(file);
    expect(Object.values(metadata).reduce<number>((n, text) => n + String(text).length, 0)).toBeLessThanOrEqual(8 * 1024 * 1024);
  });
});
