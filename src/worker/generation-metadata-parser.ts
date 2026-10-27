/** Port of the generation-field extraction approach in the user's AI image inspector.
 * Metadata is parsed as data, never evaluated. Full prompt text is preserved.
 */
import { generationMetadataSchema, type GenerationMetadata } from '../shared/generation-metadata';

type RecordValue = Record<string, unknown>;
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
function string(value: unknown): string | null {
  if (value instanceof Uint8Array) value = new TextDecoder().decode(value);
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null;
  let result = String(value);
  for (const prefix of ['ASCII\0\0\0', 'UNICODE\0']) {
    if (result.startsWith(prefix)) result = result.slice(prefix.length);
  }
  result = result.replaceAll(String.fromCharCode(0), '').trim();
  return result && result.length <= 1_048_576 ? result : null;
}
function get(value: RecordValue, ...names: string[]): unknown {
  const wanted = new Set(names.map(key));
  return Object.entries(value).find(([name]) => wanted.has(key(name)))?.[1];
}
function json(value: unknown): unknown {
  if (value && typeof value === 'object' && !(value instanceof Uint8Array)) return value;
  const candidate = string(value);
  if (!candidate || candidate.length > 4_194_304) return undefined;
  try { return JSON.parse(candidate, (_key, value, context?: { source?: string }) =>
    typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value) && context?.source
      ? context.source : value); } catch { return undefined; }
}
function nested(value: unknown, names: string[]): unknown {
  const wanted = new Set(names.map(key));
  const pending = [value];
  let count = 0;
  while (pending.length && count++ < 10_000) {
    const item = pending.shift();
    if (!item || typeof item !== 'object') continue;
    for (const [name, child] of Object.entries(item)) {
      if (wanted.has(key(name)) && child !== null && child !== '') return child;
      if (child && typeof child === 'object') pending.push(child);
    }
  }
  return undefined;
}
const unique = (values: Array<string | null | undefined>) => [...new Set(values.filter((v): v is string => Boolean(v)))].slice(0, 128);
function base(): GenerationMetadata {
  return { source: 'Embedded generation data', prompt: null, negativePrompt: null, models: [], loras: [], seed: null, steps: null, cfg: null, sampler: null, scheduler: null, width: null, height: null, raw: null, notes: [] };
}

export function parseGenerationMetadata(metadata: RecordValue): GenerationMetadata | null {
  const result = base();
  const rawPrompt = get(metadata, 'prompt', 'comfyPrompt');
  const workflow = json(get(metadata, 'workflow', 'comfyWorkflow'));
  const parsed = json(rawPrompt);
  const graph = record(record(parsed).prompt ?? parsed);
  const nodes = Object.entries(graph).filter(([, value]) => Object.keys(record(record(value).inputs)).length > 0);
  const parameters = string(get(metadata, 'parameters'));
  let raw: unknown;

  if (nodes.length) {
    result.source = 'ComfyUI';
    const textFrom = (input: unknown, seen = new Set<string>()): string | null => {
      if (!Array.isArray(input)) return string(input);
      const id = String(input[0]);
      if (seen.has(id) || seen.size > 128) return null;
      seen.add(id);
      const inputs = record(record(graph[id]).inputs);
      const parts: Array<string | null | undefined> = [];
      for (const [name, value] of Object.entries(inputs)) {
        if (/^(text(?:_.+)?|prompt|positive|conditioning|guider)$/i.test(name)) parts.push(textFrom(value, seen));
      }
      return unique(parts).join('\n') || null;
    };
    const samplers = nodes.filter(([, value]) => /sampler/i.test(String(record(value).class_type)));
    const sampler = record(record(samplers[samplers.length - 1]?.[1]).inputs);
    result.prompt = textFrom(sampler.positive ?? sampler.guider ?? sampler.conditioning);
    result.negativePrompt = textFrom(sampler.negative);
    result.seed = string(sampler.seed ?? sampler.noise_seed);
    result.steps = string(sampler.steps);
    result.cfg = string(sampler.cfg ?? sampler.guidance);
    result.sampler = string(sampler.sampler_name);
    result.scheduler = string(sampler.scheduler);
    for (const [, value] of nodes) {
      const node = record(value); const inputs = record(node.inputs);
      if (/checkpoint|unetloader|diffusionmodel/i.test(String(node.class_type))) {
        const model = string(inputs.ckpt_name ?? inputs.unet_name ?? inputs.model_name);
        if (model) result.models.push(model);
      }
      if (/lora/i.test(String(node.class_type))) {
        const lora = string(inputs.lora_name ?? inputs.filename ?? inputs.name);
        if (lora) result.loras.push(lora);
      }
      if (/latentimage/i.test(String(node.class_type))) {
        result.width = string(inputs.width); result.height = string(inputs.height);
      }
    }
    if (samplers.length > 1) result.notes.push('This workflow has multiple sampler stages. All detected models are listed; the prompt/settings shown are from the last sampler listed in the embedded graph, which may not be the final executed stage.');
    if (!result.prompt) {
      const positive = nodes.filter(([, value]) => /textencode/i.test(String(record(value).class_type))).map(([id]) => textFrom([id, 0]));
      result.prompt = unique(positive).join('\n') || null;
      if (result.prompt) result.notes.push('No primary sampler prompt was resolved. These are text-encoder values, which may include multiple conditioning prompts.');
    }
    raw = { prompt: parsed, ...(workflow ? { workflow } : {}) };
  } else if (parameters) {
    result.source = 'AUTOMATIC1111 / compatible';
    const settingsAt = parameters.search(/(?:^|\n)Steps:\s*\d/);
    const body = settingsAt >= 0 ? parameters.slice(0, settingsAt) : parameters;
    const [positive, negative] = body.split(/\nNegative prompt:\s*/i);
    result.prompt = positive?.trim() || null; result.negativePrompt = negative?.trim() || null;
    const settings = settingsAt >= 0 ? parameters.slice(settingsAt) : '';
    const field = (name: string) => settings.match(new RegExp(`(?:^|[,\\n])\\s*${name}:\\s*([^,\\n]+)`, 'i'))?.[1]?.trim() ?? null;
    result.steps = field('Steps'); result.cfg = field('CFG scale'); result.seed = field('Seed');
    result.sampler = field('Sampler'); result.scheduler = field('Schedule type');
    result.models = unique([field('Model')]);
    const size = field('Size')?.match(/(\d+)\s*[x×]\s*(\d+)/); result.width = size?.[1] ?? null; result.height = size?.[2] ?? null;
    result.loras = unique([...parameters.matchAll(/<lora:([^:>]+)(?::[^>]+)?>/gi)].map((m) => m[1]));
    raw = { parameters };
  } else {
    const candidates = [parsed, json(get(metadata, 'UserComment')), json(get(metadata, 'Description', 'ImageDescription')), json(get(metadata, 'comment')), metadata];
    const payload = candidates.find((candidate) => candidate && typeof candidate === 'object' && (
      nested(candidate, ['positive_prompt', 'positivePrompt', 'prompt', 'negative_prompt']) !== undefined
    ));
    if (!payload) return null;
    const software = string(get(metadata, 'Software', 'CreatorTool')) ?? '';
    result.source = /draw.?things/i.test(software) ? 'Draw Things' : 'Embedded generation data';
    result.prompt = string(nested(payload, ['positive_prompt', 'positivePrompt', 'prompt']));
    result.negativePrompt = string(nested(payload, ['negative_prompt', 'negativePrompt', 'unconditional_prompt']));
    const model = nested(payload, ['model', 'model_name', 'checkpoint']);
    result.models = unique([string(model) ?? string(record(model).name ?? record(model).file)]);
    const loras = nested(payload, ['loras', 'lora']);
    result.loras = unique((Array.isArray(loras) ? loras : [loras]).map((item) => string(item) ?? string(record(item).name ?? record(item).file ?? record(item).model)));
    result.seed = string(nested(payload, ['seed', 'noise_seed'])); result.steps = string(nested(payload, ['steps']));
    result.cfg = string(nested(payload, ['cfg', 'cfg_scale', 'guidance_scale']));
    result.sampler = string(nested(payload, ['sampler', 'sampler_name'])); result.scheduler = string(nested(payload, ['scheduler']));
    result.width = string(nested(payload, ['width'])); result.height = string(nested(payload, ['height']));
    raw = payload;
  }
  if (!result.prompt && !result.models.length && !result.loras.length && !result.seed) return null;
  result.models = unique(result.models); result.loras = unique(result.loras);
  const serialized = JSON.stringify(raw, null, 2);
  if (serialized.length <= 4_194_304) result.raw = serialized;
  else result.notes.push('Raw workflow exceeds the display limit; the original image retains its metadata.');
  const validated = generationMetadataSchema.safeParse(result);
  return validated.success ? validated.data : null;
}
