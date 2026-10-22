# Transxact React Native

The app side of a Transxact integration: starting a Checkout Session from a Merchant's React Native or Expo app and landing the Customer back in it. Platform terms (Merchant, Customer, Provider, Wallet, Checkout Session, Test mode / Live mode) are defined in the platform glossary, [`transxact/CONTEXT.md`](https://github.com/transxactfj/transxact/blob/main/CONTEXT.md), and mean exactly the same here. The web equivalent is `@transxact/react`; vocabulary is shared.

## Language

**Checkout Session status**:
The platform's status of a Checkout Session — pending, succeeded, failed or cancelled — and the only thing "status" ever refers to in this SDK.
_Avoid_: Status for the SDK's own loading or request progress (call that state), result, outcome.

**Merchant backend**:
The Merchant's own server, which holds the secret key and is the only party that creates or retrieves Checkout Sessions on the app's behalf.
_Avoid_: API, server (both ambiguous with Transxact's API).

**Checkout attempt**:
One Customer intent to pay for one particular thing, from pressing pay until they are sent to the Checkout Session's hosted URL; retrying the same request after an error continues the attempt, while asking for something different (the Customer changed the cart) is a new one.
_Avoid_: Request, try.

**Return screen**:
The screen the Customer lands on in the app, through an app link at a Checkout Session's success or cancel URL — a hint that the Checkout Session has moved on, never proof of its status.
_Avoid_: Success screen, callback, confirmation screen. (The web SDK calls the equivalent the Return page.)

**App link**:
The `https://` URL (a universal link on iOS, an Android App Link) that Transxact returns the Customer to. The platform requires `https://` for success and cancel URLs, so a custom URL scheme can't be used.
_Avoid_: Deep link (ambiguous with custom schemes), redirect URL.
