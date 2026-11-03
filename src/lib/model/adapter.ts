import { professorReply, type ProfessorContext } from "../ai";
import { hasCredential, type ProviderEnv } from "../credentials";

export const DEMONSTRATION_LABEL = "Demonstration reply, not a model call";

export type ModelStatus = "demonstration" | "unavailable";

export type ModelReply =
  | { status: "demonstration"; label: typeof DEMONSTRATION_LABEL; text: string }
  | { status: "unavailable"; reason: string };

export interface ModelAdapter {
  status: ModelStatus;
  reply(question: string, context: ProfessorContext): Promise<ModelReply>;
}

const demonstrationAdapter: ModelAdapter = {
  status: "demonstration",
  reply: async (question, context) => ({
    status: "demonstration",
    label: DEMONSTRATION_LABEL,
    text: professorReply(question, context),
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
