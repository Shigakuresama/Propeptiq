/**
 * ACH settlement window arithmetic.
 *
 * A reversible payment is held for a configured number of business days before
 * the order may be released, so that a bank pull-back arrives while the goods
 * are still on our shelf rather than the customer's. See docs/adr/0006.
 *
 * Pure and side-effect free: no clock, no configuration lookup. The caller
 * supplies both the payment instant and the window.
 *
 * Every rejected input returns null rather than a date. A caller that cannot
 * compute a close time must hold the order, never release it — an invalid
 * window must not degrade into "ship immediately".
 */

/** Weekends only. Banking holidays are deliberately not modelled; see note. */
const WEEKEND = new Set([0, 6]);

/**
 * A window longer than this is treated as misconfiguration rather than intent.
 * Without a ceiling, a typo such as 3650 would park institutional orders for a
 * decade with no error anywhere.
 */
const MAXIMUM_BUSINESS_DAYS = 90;

export function settlementWindowClosesAt(
  paidAt: Date,
  businessDays: number,
): Date | null {
  if (!(paidAt instanceof Date) || !Number.isFinite(paidAt.getTime())) {
    return null;
  }
  if (
    !Number.isSafeInteger(businessDays) ||
    businessDays < 1 ||
    businessDays > MAXIMUM_BUSINESS_DAYS
  ) {
    return null;
  }

  // Time of day is preserved throughout, so a window can only ever be measured
  // from the payment instant and never silently shortened by rounding to a
  // date boundary.
  const closes = new Date(paidAt.getTime());
  let remaining = businessDays;
  while (remaining > 0) {
    closes.setUTCDate(closes.getUTCDate() + 1);
    if (!WEEKEND.has(closes.getUTCDay())) {
      remaining -= 1;
    }
  }
  return closes;
}

/**
 * Banking holidays are not modelled. A holiday inside the window shortens the
 * effective banking time by one day, which is a real but bounded reduction in
 * safety margin rather than a correctness bug. Modelling US federal holidays
 * would need a maintained calendar and belongs with the operator, not here.
 */
export const SETTLEMENT_WINDOW_EXCLUDES_HOLIDAYS = true;
