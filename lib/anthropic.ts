import Anthropic from "@anthropic-ai/sdk";

// The model is env-configurable so the deployment can be bumped to whatever the
// account has access to without a code change. The default is a current,
// PDF-capable Claude model.
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment (.env.local locally, or a project env var on Vercel).",
    );
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

/**
 * Run a single tool-forced Claude call and return the tool input as typed JSON.
 * Forcing a specific tool guarantees the model returns schema-valid structured
 * data instead of prose we'd have to parse.
 */
export async function callTool<T>(opts: {
  system: string;
  content: Anthropic.Messages.ContentBlockParam[];
  toolName: string;
  toolDescription: string;
  schema: Anthropic.Messages.Tool.InputSchema;
  maxTokens?: number;
}): Promise<T> {
  const anthropic = getClient();
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8192,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.schema,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [{ role: "user", content: opts.content }],
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Model did not return structured tool output.");
  }
  return block.input as T;
}
