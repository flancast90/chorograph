/**
 * Payments service — class-style declarations with decorators, for codebases organised around
 * classes. `@service` claims the decorated members and stamps the class itself as a node, so
 * other modules can point edges at it via `archRef(PaymentsService)`.
 */
import { endpoint, func, job, service } from "../../../src/index.ts";
import { ordersDomain, stripe } from "../architecture.ts";
import { paymentCaptured } from "../events.ts";
import { paymentLedgerTable } from "../infra.ts";

interface LedgerEntry {
  orderId: string;
  amountCents: number;
  feeCents: number;
  capturedAt: Date;
}

const ledger: LedgerEntry[] = [];

@service("payments", {
  domain: ordersDomain,
  description: "Wraps the payment provider; the only service allowed to talk to Stripe.",
  tech: "Node.js",
})
export class PaymentsService {
  @endpoint("POST /charge", { calls: [[stripe, "create charge"]], writes: [paymentLedgerTable], emits: [paymentCaptured] })
  async charge(orderId: string, amountCents: number): Promise<LedgerEntry> {
    if (amountCents <= 0) throw new Error("amount must be positive");
    const entry: LedgerEntry = {
      orderId,
      amountCents,
      feeCents: this.computeFees(amountCents),
      capturedAt: new Date(),
    };
    ledger.push(entry);
    return entry;
  }

  @job("reconcile-payments", {
    description: "Nightly. Compares our ledger against Stripe and records drift.",
    reads: [paymentLedgerTable],
    calls: [[stripe, "list charges"]],
  })
  async reconcile(): Promise<{ checked: number; drift: number }> {
    const checked = ledger.length;
    const drift = ledger.filter((e) => e.feeCents !== this.computeFees(e.amountCents)).length;
    return { checked, drift };
  }

  @func("computeFees", { description: "Stripe's 2.9% + 30¢, mirrored so reconciliation can detect drift." })
  computeFees(amountCents: number): number {
    return Math.round(amountCents * 0.029) + 30;
  }
}
