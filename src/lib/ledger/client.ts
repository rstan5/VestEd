import type { Book } from "@/lib/portfolio";
import type { BookValuation } from "./book";
import type { LedgerBook, OrderPayload } from "./types";

export type StudentLedgerState =
  | { status: "signed-out" }
  | { status: "loading" }
  | { status: "ready"; book: LedgerBook; valuation: BookValuation }
  | { status: "unavailable"; message: string };

type ApiFailure = { error?: { code?: string; message?: string } };

async function failureMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiFailure;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** Reads the signed-in student's own book from the server. The session cookie names the account. */
export async function fetchStudentLedger(): Promise<StudentLedgerState> {
  let response: Response;
  try {
    response = await fetch("/api/portfolio", { cache: "no-store" });
  } catch {
    return { status: "unavailable", message: "The ledger could not be reached." };
  }
  if (response.status === 401) return { status: "signed-out" };
  if (!response.ok) return { status: "unavailable", message: await failureMessage(response, "Your book could not be loaded.") };
  const body = (await response.json()) as { book: LedgerBook; valuation: BookValuation };
  return { status: "ready", book: body.book, valuation: body.valuation };
}

export type ServerOrderResult =
  | { ok: true; order: OrderPayload }
  | { ok: false; message: string };

export async function submitServerOrder(input: {
  instrument: string;
  side: "buy" | "sell";
  quantity: number;
  idempotencyKey: string;
}): Promise<ServerOrderResult> {
  let response: Response;
  try {
    response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, message: "The ledger could not be reached. Your order was not placed." };
  }
  if (!response.ok) return { ok: false, message: await failureMessage(response, "The order was rejected.") };
  const body = (await response.json()) as { order: OrderPayload };
  return { ok: true, order: body.order };
}

export async function cancelServerOrder(orderId: string): Promise<ServerOrderResult> {
  let response: Response;
  try {
    response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST" });
  } catch {
    return { ok: false, message: "The ledger could not be reached. The order is unchanged." };
  }
  if (!response.ok) return { ok: false, message: await failureMessage(response, "The order could not be cancelled.") };
  const body = (await response.json()) as { order: OrderPayload };
  return { ok: true, order: body.order };
}

/**
 * Maps a complete valuation onto the display Book. Returns null when any held position
 * lacks a stored quote, so the page shows an unavailable state instead of an invented price.
 */
export function studentDomainBook(valuation: BookValuation): Book | null {
  if (valuation.equity === null || valuation.invested === null || valuation.unrealized === null) return null;
  const positions = valuation.positions.map((position) => {
    if (position.price === null || position.marketValue === null || position.unrealized === null || position.returnPct === null || position.weight === null) {
      return null;
    }
    return {
      ticker: position.instrumentId,
      name: position.name,
      sector: position.sector,
      quantity: Number(position.quantity),
      averageCost: Number(position.averageCost),
      price: Number(position.price),
      marketValue: Number(position.marketValue),
      cost: Number(position.costBasis),
      unrealized: Number(position.unrealized),
      returnPct: Number(position.returnPct),
      weight: Number(position.weight),
    };
  });
  if (positions.some((position) => position === null)) return null;
  return {
    positions: positions as Book["positions"],
    equity: Number(valuation.equity),
    cash: Number(valuation.cash),
    invested: Number(valuation.invested),
    unrealized: Number(valuation.unrealized),
    realized: Number(valuation.realized),
  };
}
