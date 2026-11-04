import type { StandingsPayload } from "./load";

export type ServerStandingsState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "ready"; payload: StandingsPayload; viewerId: string }
  | { status: "unavailable"; message: string };

/** Reads published standings for the signed-in viewer. The browser displays them and never ranks. */
export async function fetchServerStandings(signal?: AbortSignal): Promise<ServerStandingsState> {
  let response: Response;
  try {
    response = await fetch("/api/standings", { cache: "no-store", signal });
  } catch {
    return { status: "unavailable", message: "Standings could not be reached." };
  }
  if (response.status === 401) return { status: "signed-out" };
  if (!response.ok) {
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      return { status: "unavailable", message: body.error?.message ?? "Standings could not be loaded." };
    } catch {
      return { status: "unavailable", message: "Standings could not be loaded." };
    }
  }
  const body = (await response.json()) as StandingsPayload & { viewerId: string };
  const { viewerId, ...payload } = body;
  return { status: "ready", payload, viewerId };
}
