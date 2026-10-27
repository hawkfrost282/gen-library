import { z } from 'zod';

const text = z.string().max(1_048_576).nullable();
export const generationMetadataSchema = z.strictObject({
  source: z.string().max(128),
  prompt: text,
  negativePrompt: text,
  models: z.array(z.string().max(2048)).max(128),
  loras: z.array(z.string().max(2048)).max(128),
  seed: z.string().max(128).nullable(),
  steps: z.string().max(128).nullable(),
  cfg: z.string().max(128).nullable(),
  sampler: z.string().max(512).nullable(),
  scheduler: z.string().max(512).nullable(),
  width: z.string().max(128).nullable(),
  height: z.string().max(128).nullable(),
  raw: z.string().max(4_194_304).nullable(),
  notes: z.array(z.string().max(1024)).max(16),
});
export type GenerationMetadata = z.infer<typeof generationMetadataSchema>;
