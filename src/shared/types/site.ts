// Where Remry Pro is bought, and help with it. The app only links to these and never sends
// them a request: license keys are checked offline. Keys are issued by jweatherby.dev (a Stripe
// webhook and a thanks page; its README has the setup), never by the app.
// `buy` is a placeholder until the Stripe Payment Link exists; the README's buy button uses it too.

export const REMRY_LINKS = {
  buy: 'https://buy.stripe.com/REMRY_PRO_PAYMENT_LINK',
  help: 'https://github.com/remry-ai/remry#remry-pro'
} as const;
