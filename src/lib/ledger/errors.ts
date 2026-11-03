type Known = { status: number; message: string };

const CODES: Record<string, Known> = {
  not_signed_in: { status: 401, message: "Sign in to trade." },
  unexpected_field: { status: 400, message: "Orders carry only a symbol, a side, a share count, and a request key. Prices, balances, accounts, and times are set by the server." },
  invalid_request: { status: 400, message: "The order request was not readable." },
  invalid_idempotency_key: { status: 400, message: "The order request key is missing or malformed." },
  invalid_side: { status: 422, message: "Orders are buy or sell. Short selling is not enabled." },
  quantity_not_positive: { status: 422, message: "Enter a positive whole number of shares." },
  fractional_quantity: { status: 422, message: "Whole shares only." },
  quantity_too_large: { status: 422, message: "That share count is above the per-order limit." },
  unknown_instrument: { status: 422, message: "That symbol is not in the tradable universe." },
  instrument_not_allowed: { status: 422, message: "Only US stocks and ETFs can be traded. Options, leveraged products, futures, and crypto are not allowed." },
  no_reference_quote: { status: 422, message: "No stored quote exists for this symbol yet, so a buy cannot be reserved." },
  insufficient_cash: { status: 422, message: "Not enough available cash for this buy, including the price collar and the $0.01 per share simulation cost." },
  insufficient_shares: { status: 422, message: "You cannot sell more shares than you hold and have not already committed to another sell." },
  season_closed: { status: 422, message: "The season closes before this order could work." },
  season_not_started: { status: 422, message: "The season has not started yet." },
  no_open_season: { status: 422, message: "No season is open for registration." },
  idempotency_conflict: { status: 409, message: "This request key was already used for a different order." },
  order_not_found: { status: 404, message: "That order is not in your book." },
  order_not_open: { status: 409, message: "Only an order that has not filled, expired, or been cancelled can be cancelled." },
  no_profile: { status: 409, message: "This sign-in has no student profile." },
  ledger_unavailable: { status: 503, message: "The ledger did not respond. Try again." },
};

export function ledgerError(code: string): Known & { code: string } {
  const known = CODES[code];
  return known ? { code, ...known } : { code: "ledger_unavailable", ...CODES.ledger_unavailable };
}

/** Ledger functions raise errors whose message is a code. */
export function ledgerErrorFrom(error: { message?: string } | null | undefined): Known & { code: string } {
  return ledgerError(error?.message ?? "ledger_unavailable");
}
