import { stackProblem } from "./stack";

export default async function globalSetup() {
  const problem = await stackProblem();
  if (problem) throw new Error(`${problem}. Start the web and supabase services from services.yaml first.`);
}
