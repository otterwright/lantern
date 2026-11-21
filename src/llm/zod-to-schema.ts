import { z, type ZodType } from 'zod';

// Produces a JSON Schema acceptable to Claude Code's `--json-schema` flag.
// `io: 'input'` describes what the model must send (before preprocess/transform),
// and the `$schema` URL is stripped because some consumers reject it as an unknown keyword.
// Input mode leaves objects open; the override closes them so the model can't add keys.
export function zodToProviderSchema(schema: ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-7',
    unrepresentable: 'any',
    override: ({ jsonSchema }) => {
      if (jsonSchema.type === 'object') jsonSchema.additionalProperties = false;
    },
  }) as Record<string, unknown>;
  delete out['$schema'];
  return out;
}
