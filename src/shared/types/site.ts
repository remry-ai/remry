// Where Remry Pro is bought, and help with it. The app only links to these and never sends
// them a request: license keys are checked offline. Keys are issued by jweatherby.dev (a Stripe
// webhook and a thanks page; its README has the setup), never by the app.
// The README's buy button uses this too.

export const REMRY_LINKS = {
  buy: 'https://buy.stripe.com/bJefZg54rbNLa0H1sb0Jq01',
  help: 'https://github.com/remry-ai/remry#remry-pro'
} as const;
