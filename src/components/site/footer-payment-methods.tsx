import { ChevronDown } from "lucide-react";

// Processor capabilities, not an assertion about this store's enabled methods.
// Verified 2026-09-06 against https://docs.stripe.com/payments/payment-methods/overview.
const methodGroups = [
  { name: "Cards", methods: ["Visa", "Mastercard", "American Express", "Diners", "Discover", "Interac (in-person only)", "Cartes Bancaires", "eftpos", "JCB", "China Union Pay", "South Korean Cards"] },
  { name: "Bank debits", methods: ["Instant Bank Payments", "ACH Direct Debit", "Canadian PADs", "Bacs Direct Debit", "SEPA Direct Debit", "AU BECS Direct Debit", "NZ BECS Direct Debit"] },
  { name: "Bank redirects", methods: ["Bancontact", "BLIK", "EPS", "iDEAL | Wero", "P24", "TWINT", "FPX", "PayNow", "UPI"] },
  { name: "Bank transfers", methods: ["USD Bank Transfer", "SEPA Bank Transfer", "UK Bank Transfer", "Japan Bank Transfer (Furikomi)", "Mexico Bank Transfer"] },
  { name: "Buy now, pay later", methods: ["Affirm", "Afterpay / Clearpay", "Klarna", "Meses sin intereses", "Zip"] },
  { name: "Real-time payments", methods: ["Swish (invite only)", "PayTo", "Pix", "PayNow", "PromptPay"] },
  { name: "Vouchers", methods: ["Multibanco", "Konbini", "OXXO", "Boleto"] },
  { name: "Wallets", methods: ["Apple Pay", "Google Pay", "Link", "Secure Remote Commerce", "Stablecoins and crypto", "Cash App Pay", "PayPal", "MobilePay", "Revolut Pay", "Satispay", "MB WAY", "Alipay", "WeChat Pay", "PayPay", "GrabPay", "Kakao Pay", "Naver Pay", "Samsung Pay", "PayCo"] },
] as const;

export function FooterPaymentMethods() {
  return (
    <div className="footer-payment-methods">
      {/* Deliberate textmarks: no unofficial or approximated brand artwork. */}
      <div className="footer-payment-methods__marks" aria-hidden="true">
        {["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay", "Link"].map((method) => (
          <span key={method}>{method}</span>
        ))}
      </div>
      <details className="footer-payment-methods__disclosure">
        <summary className="footer-payment-methods__summary min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas">
          <span>Stripe-supported methods</span><ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        </summary>
        <div className="footer-payment-methods__panel">
          <div className="footer-payment-methods__groups">
            {methodGroups.map((group) => (
              <section key={group.name} aria-label={group.name}>
                <h3>{group.name}</h3>
                <ul>{group.methods.map((method) => <li key={method}>{method}</li>)}</ul>
              </section>
            ))}
          </div>
          <a href="https://docs.stripe.com/payments/payment-methods/overview"
            className="footer-nav-link inline-flex min-h-11 min-w-11 items-center rounded-md px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas">
            View Stripe’s method availability
          </a>
        </div>
      </details>
      <p className="footer-payment-methods__availability">Available options vary by country and checkout.</p>
    </div>
  );
}
