# Storefront annotations release

This follow-up implements the owner's September 6 annotations on the PR42 storefront. It preserves the existing neutral/teal palette, Newsreader/Geist typography, catalog imagery and server-owned commerce facts.

## Product selection

- Match the product image to the purchase column on desktop; compact the amount controls while retaining 44px touch targets.
- Remove the repeated Product specifications disclosure and visible “Price unavailable” wording. Unpriced amounts remain disabled in production; the explicit local test mode retains its synthetic fixture behavior.
- Use a bounded minus/plus quantity control. Invalid typed quantities cannot be added to the cart.
- Place matching bottle bundles above Add to Cart. Two or three bottles receive 3% extra savings, four through ten 6%, and eleven or more 30%, after WINTER30. Packages count actual bottles, and different variants stay separate.
- Calculate cents per package unit after the campaign and again after the volume tier. For a $59.99 single bottle: WINTER30 makes it $41.99; two cost $81.46, four $157.88, and eleven $323.29. Cart preview and server checkout share the same calculation and invalidate earlier quote revisions.
- Use Recommended and Value Pack labels without asserting unverified sales popularity; Bulk carries Best Value because it has the greatest volume discount.

## Information and shared navigation

All 56 catalog identities have a compound profile. Twenty-six include reviewed PubChem molecular data. Ambiguous labels and blends omit unsupported molecular fields; molecular references do not certify the supplied product or batch. Sources and exceptions are documented in [compound-information-sources.md](./compound-information-sources.md).

The header and promotion use stronger finite molecular motion with reduced-motion support. Only WINTER30 is boxed, beside an accessible copy icon. Rewards actions render uppercase. Product-title links have a full clickable area and suppress a text caret.

Search lives in the persistent header after screenshot review found that the floating trigger covered product text. The mobile purchase controls have a separate fixed position. Removing the central search clearance also allows a smaller gap between the product image and purchase column.

The footer places SSL on the left, reduces spacing, and centers a compact method row with the complete processor list in a disclosure. It says Stripe-supported methods, because store availability depends on actual configuration and checkout. [Stripe method overview](https://docs.stripe.com/payments/payment-methods/overview).

## Contact activation

Recipient: contact@propeptiq.com. Initial limit: three submissions per caller in ten minutes. The existing server-only Resend key and verified-sender setting remain in place. Migration 0032 adds only the durable email-delivery journal and its index; the operator verifies the exact production target, full migration prefix and recovery copy before applying it. See [contact operations](../runbooks/contact.md).

The owner explicitly requested deployment without a test email. Configuration and non-delivering API checks can be verified; actual email delivery remains unverified.

## Original UX improvements to consider next

1. **A compact savings receipt.** Expand the price into original total, WINTER30 savings, bundle savings and final total, with the same detail in cart. This builds on the transparent pricing already implemented.
2. **A product record drawer.** Bring the selected amount, exact SKU, named identity source and available quality documents together. Only show records that exist for that selection.
3. **A small comparison tray.** Compare up to three selections by bottle count, price, reference identity and document availability, without therapeutic rankings.
4. **Contextual contact.** “Ask about this selection” can prefill an editable contact message with the product, amount and quantity.

These ideas use the site's research-record identity to distinguish it from the bottle-led purchasing layout used as the [Amino Club reference](https://www.aminoclub.com/us/products/ghkcu-spray). They are suggestions, not additional shipped features.
