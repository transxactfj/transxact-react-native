# @transxact/react-native

## 0.1.0

First release of `@transxact/react-native`, the client-only React Native SDK for Transxact hosted Checkout Sessions. Pure JavaScript, so it works in Expo Go.

- `useCheckout` and `<CheckoutButton>` start a Checkout attempt through the Merchant backend and open the Checkout Session's hosted URL (device browser by default, or your own in-app browser through `redirect`), with an Idempotency-Key per Checkout attempt, a double-press guard and https-only `hostedUrl` validation. The screen resets when the Customer comes back to the app without finishing.
- `useCheckoutReturn` confirms the Checkout Session status on the Return screen through the Merchant backend, polling while it is `pending`. The Checkout Session id comes from your router, or from the app link that opened the app.
- `<TransxactProvider>` holds shared settings; `createSessionUrl` / `retrieveSessionUrl` shorthands cover simple Merchant backends.
- Never takes an amount or a secret key.
