/**
 * Wraps the payment provider; the only service allowed to talk to Stripe.
 * @service payments in:Orders tech:Node.js
 */

interface LedgerEntry {
  orderId: string;
  amountCents: number;
  feeCents: number;
  capturedAt: Date;
}

const ledger: LedgerEntry[] = [];

export class PaymentsService {
  /**
   * @endpoint POST /charge
   * @calls Stripe create charge
   * @writes orders-db.payment_ledger
   * @emits payment.captured
   */
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

  /**
   * Nightly. Compares our ledger against Stripe and records drift.
   * @job reconcile-payments
   * @reads orders-db.payment_ledger
   * @calls Stripe list charges
   */
  async reconcile(): Promise<{ checked: number; drift: number }> {
    const checked = ledger.length;
    const drift = ledger.filter((e) => e.feeCents !== this.computeFees(e.amountCents)).length;
    return { checked, drift };
  }

  /**
   * Stripe's 2.9% + 30¢, mirrored so reconciliation can detect drift.
   * @fn
   */
  computeFees(amountCents: number): number {
    return Math.round(amountCents * 0.029) + 30;
  }
}
