export type ProviderEnv = Readonly<Record<string, string | undefined>>;

export function hasCredential(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
