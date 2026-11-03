import { SPREAD, type Ledger, type Order, type Position, type Security } from "./domain";

export type Valuation = {
  ticker: string;
  name: string;
  sector: string;
  quantity: number;
  averageCost: number;
  price: number;
  marketValue: number;
  cost: number;
  unrealized: number;
  returnPct: number;
  weight: number;
};

export type Book = {
  positions: Valuation[];
  equity: number;
  cash: number;
  invested: number;
  unrealized: number;
  realized: number;
};

export function marketValue(quantity: number, price: number): number {
  return roundMoney(quantity * price);
}

export function valueBook(ledger: Ledger, securities: Security[]): Book {
  const prices = new Map(securities.map((security) => [security.ticker, security]));
  const raw = ledger.positions
    .filter((position) => position.quantity > 0)
    .map((position) => {
      const security = prices.get(position.ticker);
      const price = security?.price ?? position.averageCost;
      const value = marketValue(position.quantity, price);
      const cost = roundMoney(position.quantity * position.averageCost);
      return {
        ticker: position.ticker,
        name: security?.name ?? position.ticker,
        sector: security?.sector ?? "Unknown",
        quantity: position.quantity,
        averageCost: position.averageCost,
        price,
        marketValue: value,
        cost,
        unrealized: roundMoney(value - cost),
        returnPct: cost === 0 ? 0 : value / cost - 1,
        weight: 0,
      };
    });
  const invested = roundMoney(raw.reduce((sum, position) => sum + position.marketValue, 0));
  const equity = roundMoney(invested + ledger.cash);
  return {
    positions: raw
      .map((position) => ({ ...position, weight: equity === 0 ? 0 : position.marketValue / equity }))
      .sort((a, b) => b.marketValue - a.marketValue),
    equity,
    cash: roundMoney(ledger.cash),
    invested,
    unrealized: roundMoney(raw.reduce((sum, position) => sum + position.unrealized, 0)),
    realized: roundMoney(ledger.realizedGain),
  };
}

export type OrderRequest = {
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  clientOrderId?: string;
  submittedAt?: string;
};

export type OrderResult = {
  ledger: Ledger;
  order: Order;
  accepted: boolean;
};

export function placeOrder(ledger: Ledger, securities: Security[], request: OrderRequest): OrderResult {
  const security = securities.find((item) => item.ticker === request.ticker);
  const quantity = request.quantity;
  const id = request.clientOrderId ?? `ord-${Date.now()}`;
  const submittedAt = request.submittedAt ?? new Date().toISOString();

  const reject = (reason: string): OrderResult => {
    const order: Order = {
      id,
      ticker: request.ticker.toUpperCase(),
      side: request.side,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      quotePrice: security?.price ?? 0,
      fillPrice: null,
      status: "rejected",
      reason,
      submittedAt,
    };
    return { ledger: { ...ledger, orders: [order, ...ledger.orders] }, order, accepted: false };
  };

  if (ledger.orders.some((order) => order.id === id)) {
    return reject("This order id was already processed.");
  }
  if (!security) return reject("Only listed sample US stocks and ETFs can be traded.");
  if (!Number.isInteger(quantity) || quantity <= 0) return reject("Quantity must be a positive whole number of shares.");

  const position = ledger.positions.find((item) => item.ticker === security.ticker);

  if (request.side === "buy") {
    const fillPrice = roundMoney(security.price + SPREAD);
    const debit = roundMoney(quantity * fillPrice);
    if (debit > ledger.cash + 0.001) {
      return reject(`Estimated debit ${debit.toFixed(2)} exceeds cash ${ledger.cash.toFixed(2)}.`);
    }
    const nextPosition = addShares(position, security.ticker, quantity, fillPrice);
    const order: Order = {
      id,
      ticker: security.ticker,
      side: "buy",
      quantity,
      quotePrice: security.price,
      fillPrice,
      status: "filled",
      reason: "Filled at the sample quote plus a one-cent spread. The displayed price was not used as a free fill.",
      submittedAt,
    };
    return {
      accepted: true,
      order,
      ledger: {
        cash: roundMoney(ledger.cash - debit),
        realizedGain: ledger.realizedGain,
        positions: upsert(ledger.positions, nextPosition),
        orders: [order, ...ledger.orders],
      },
    };
  }

  if (!position || position.quantity < quantity) {
    return reject("Sell quantity exceeds the open position. Short selling is not enabled.");
  }
  const fillPrice = roundMoney(Math.max(security.price - SPREAD, 0.01));
  const credit = roundMoney(quantity * fillPrice);
  const realized = roundMoney(quantity * (fillPrice - position.averageCost));
  const remaining = position.quantity - quantity;
  const order: Order = {
    id,
    ticker: security.ticker,
    side: "sell",
    quantity,
    quotePrice: security.price,
    fillPrice,
    status: "filled",
    reason: "Filled at the sample quote minus a one-cent spread. Average cost was used to realize the gain.",
    submittedAt,
  };
  return {
    accepted: true,
    order,
    ledger: {
      cash: roundMoney(ledger.cash + credit),
      realizedGain: roundMoney(ledger.realizedGain + realized),
      positions: remaining === 0
        ? ledger.positions.filter((item) => item.ticker !== security.ticker)
        : upsert(ledger.positions, { ...position, quantity: remaining }),
      orders: [order, ...ledger.orders],
    },
  };
}

function addShares(position: Position | undefined, ticker: string, quantity: number, fillPrice: number): Position {
  if (!position) return { ticker, quantity, averageCost: fillPrice };
  const cost = position.quantity * position.averageCost + quantity * fillPrice;
  const nextQuantity = position.quantity + quantity;
  return { ticker, quantity: nextQuantity, averageCost: roundMoney(cost / nextQuantity) };
}

function upsert(positions: Position[], next: Position): Position[] {
  const exists = positions.some((position) => position.ticker === next.ticker);
  if (!exists) return [...positions, next];
  return positions.map((position) => (position.ticker === next.ticker ? next : position));
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sectorWeights(book: Book): Array<{ sector: string; weight: number; value: number }> {
  const buckets = new Map<string, number>();
  for (const position of book.positions) {
    buckets.set(position.sector, (buckets.get(position.sector) ?? 0) + position.marketValue);
  }
  return [...buckets.entries()]
    .map(([sector, value]) => ({
      sector,
      value,
      weight: book.equity === 0 ? 0 : value / book.equity,
    }))
    .sort((a, b) => b.value - a.value);
}
