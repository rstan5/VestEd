import { hasCredential, type ProviderEnv } from "../credentials";
import { demonstrationReply } from "../professor/demonstration";
import type { ContextPack } from "../professor/types";
import { DEMONSTRATION_LABEL, type ModelStatus } from "./status";

export { DEMONSTRATION_LABEL, type ModelStatus };

export type ModelReply =
  | { status: "demonstration"; label: typeof DEMONSTRATION_LABEL; text: string }
  | { status: "unavailable"; reason: string };

export interface ModelAdapter {
  status: ModelStatus;
  reply(question: string, context: ContextPack): Promise<ModelReply>;
}

const demonstrationAdapter: ModelAdapter = {
  status: "demonstration",
  reply: async (question, context) => ({
    status: "demonstration",
    label: DEMONSTRATION_LABEL,
    text: demonstrationReply(question, context),
  }),
};

const notConnectedAdapter: ModelAdapter = {
  status: "unavailable",
  reply: async () => ({
    status: "unavailable",
    reason: "A model key is set, but no model provider is connected in this build.",
  }),
};

export function createModelAdapter(env: ProviderEnv = process.env): ModelAdapter {
  return hasCredential(env.AI_API_KEY) ? notConnectedAdapter : demonstrationAdapter;
}
