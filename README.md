# @transxact/react-native

React Native hooks and components for taking payments with [Transxact](https://transxact.io) hosted Checkout Sessions — M-PAiSA and MyCash, in FJD.

`@transxact/react-native` is **client-only** and pure JavaScript (no native modules, so it works in Expo Go). It never holds a Transxact key and never calls Transxact: every request goes to _your_ server (the **Merchant backend**), which uses [`@transxact/node`](https://www.npmjs.com/package/@transxact/node) and your secret key. The SDK covers the two app legs of a payment:

1. **Pay** — ask the Merchant backend to create a Checkout Session, then open its hosted URL.
2. **Return screen** — when the Customer comes back to the app, ask the Merchant backend what actually happened.

It never takes an amount. Prices are decided by the Merchant backend, where the Customer can't edit them. It is the React Native sibling of [`@transxact/react`](https://github.com/transxactfj/transxact-react) and shares its API.

## Install

```bash
npm install @transxact/react-native
```

Requires React 18+ and React Native 0.72+ (Expo SDK 49+). Nothing else to install or link.

## How it fits together

```
App ──POST──▶ Merchant backend ──▶ Transxact          (create: returns hostedUrl)
App ──opens hostedUrl in a browser──▶ Customer pays
Browser ──https app link──▶ App  (?session_id=cs_…)
App ──GET──▶ Merchant backend ──▶ Transxact            (what actually happened?)
```

Transxact's hosted checkout returns the Customer to your `successUrl` / `cancelUrl`, which **must be `https://`** — custom URL schemes such as `myapp://` are rejected. So the app must register a **universal link (iOS)** or **app link (Android)** for that URL. In Expo, that's `ios.associatedDomains` and `android.intentFilters` in `app.json` (with `autoVerify: true`).

## Quickstart

### 1. Pay button

```tsx
import { CheckoutButton, TransxactProvider } from "@transxact/react-native";

const BACKEND = "https://shop.example/api/checkout"; // absolute URL — there is no relative URL in an app

export function Cart({ orderId }: { orderId: string }) {
    return (
        <TransxactProvider createSessionUrl={BACKEND} retrieveSessionUrl={BACKEND}>
            <CheckoutButton payload={{ orderId }} style={{ padding: 12 }}>
                Pay with M-PAiSA or MyCash
            </CheckoutButton>
        </TransxactProvider>
    );
}
```

Pressing the button POSTs `{ orderId }` to your backend with an `Idempotency-Key` header, then opens the returned `hostedUrl`. While that happens the button is disabled and reports `busy` to screen readers, and repeat presses are ignored. A string child is wrapped in `<Text>` for you (style it with `textStyle`).

By default the hosted URL opens in the device browser (`Linking.openURL`). The Transxact docs recommend an **in-app browser** (Safari View Controller / Chrome Custom Tabs); pass `redirect` to use one:

```tsx
import * as WebBrowser from "expo-web-browser";

<CheckoutButton payload={{ orderId }} redirect={(url) => WebBrowser.openBrowserAsync(url)}>
    Pay
</CheckoutButton>
```

### 2. Return screen

Transxact appends `?session_id=cs_…` to the app link. The hook confirms the outcome with your backend:

```tsx
import { useCheckoutReturn } from "@transxact/react-native";
import { Button, Text } from "react-native";

export function CheckoutReturn() {
    // Prefer your router's param when you have one: useCheckoutReturn({ sessionId })
    const { state, session, refresh } = useCheckoutReturn({ retrieveSessionUrl: BACKEND });

    if (state === "missing") return <Text>No payment to show.</Text>;
    if (state === "error") return <Button title="Couldn't check your payment — try again" onPress={refresh} />;
    if (state === "timed_out") return <Text>Still confirming your payment. We'll email you when it's done.</Text>;
    if (state !== "settled") return <Text>Confirming your payment…</Text>;

    switch (session?.status) {
        case "succeeded":
            return <Text>Paid — thank you!</Text>;
        case "failed":
            return <Text>The payment didn't go through.</Text>;
        case "cancelled":
            return <Text>The payment was cancelled.</Text>;
    }
}
```

`state` is what the hook is doing; `session.status` is the payment. They are deliberately separate, so "our request failed" (`state === "error"`) is never confused with "the payment failed" (`session.status === "failed"`).

**Where `session_id` comes from.** With Expo Router or React Navigation, route your app link to the Return screen and pass the parameter in (`useCheckoutReturn({ sessionId })`, using `null` if absent) — that is the most reliable way. If you pass nothing, the hook reads `session_id` from the link that opened the app, or from the next link the app receives while open (`Linking`). `getSessionIdFromUrl(url)` is exported if you want to parse a link yourself.

### 3. Merchant backend

Identical to [`@transxact/react`](https://github.com/transxactfj/transxact-react#3-merchant-backend-nextjs-app-router): create the Checkout Session on your server with `@transxact/node`, using your own price lookup, forward the `Idempotency-Key`, and set `successUrl` / `cancelUrl` to your app link:

```ts
const session = await transxact.checkoutSessions.create({
    idempotencyKey: request.headers.get("Idempotency-Key") ?? crypto.randomUUID(),
    amount: order.totalCents,
    currency: "FJD",
    successUrl: "https://shop.example/checkout/return", // an app link, not myapp://
    cancelUrl: "https://shop.example/checkout/return",
    metadata: { orderId },
});
return Response.json({ id: session.id, hostedUrl: session.hostedUrl });
```

The secret key lives only on that server — **never put a Transxact key in the app binary**. Your backend should authenticate the app's user (pass a token with `fetchInit` below).

### Your own functions instead of URLs

```tsx
<TransxactProvider
    createSession={async ({ idempotencyKey, signal }) => {
        const response = await fetch("https://shop.example/api/orders/current/pay", {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey, Authorization: `Bearer ${token}` },
            signal,
        });
        if (!response.ok) throw new Error("Couldn't start the payment");
        return response.json(); // must include hostedUrl
    }}
    retrieveSession={async (sessionId, { signal }) => {
        const response = await fetch(`https://shop.example/api/payments/${sessionId}`, { signal });
        if (!response.ok) throw new Error("Couldn't check the payment");
        return response.json(); // must include status
    }}
>
    {children}
</TransxactProvider>
```

## The Return screen is a hint, not proof

Transxact appends `session_id` to **both** `successUrl` and `cancelUrl`, and sends the Customer to `cancelUrl` for failed and expired Checkout Sessions too. Opening your app from that link tells you nothing about the outcome, which is why `useCheckoutReturn` always asks the Merchant backend and polls while the Checkout Session is `pending`.

Even then, the screen is only for showing the Customer something. **Fulfil orders from Transxact's webhooks (or a server-side lookup), never from the redirect** — the Customer may never come back to the app.

## API

### `<TransxactProvider>`

Optional defaults for everything beneath it. Props on a hook or component always win.

| Prop | Type | |
|---|---|---|
| `createSession` | `(context) => Promise<{ hostedUrl }>` | Your own function to create a Checkout Session |
| `createSessionUrl` | `string` | Absolute URL shorthand for creating (POSTs `payload` as JSON, expects `{ hostedUrl }`) |
| `retrieveSession` | `(sessionId, { signal }) => Promise<Session>` | Your own function to look up a Checkout Session |
| `retrieveSessionUrl` | `string \| (sessionId) => string` | Absolute URL shorthand for looking up (GET, with `session_id` added) |
| `fetchInit` | `RequestInit` (no body/method/signal) | Extra options for the URL shorthands, e.g. `{ headers: { Authorization: "Bearer …" } }` |
| `polling` | `{ intervalMs?, maxIntervalMs?, timeoutMs? }` | Return screen polling defaults |

**Precedence:** props beat the provider; at the same level a function beats a URL.

### `useCheckout(options)` and `<CheckoutButton>`

```ts
const { start, reset, state, error } = useCheckout({ createSessionUrl: BACKEND, payload: { orderId } });
```

| Option | |
|---|---|
| `createSession` / `createSessionUrl` | How to reach the Merchant backend (or set on the provider) |
| `payload` | JSON sent by `createSessionUrl` — what is being bought, never the price |
| `onError(error)` | Called whenever `state` becomes `error` |
| `redirect(hostedUrl)` | Replace the default `Linking.openURL`, e.g. with an in-app browser. If it returns a promise, `state` returns to `idle` when the promise settles (for an in-app browser, when the Customer closes it) and a rejection becomes `error` |

- `state`: `idle → creating → redirecting`, or `error`.
- `start()` begins a **Checkout attempt**, or retries the current one after an error. It's ignored while one is under way.
- `reset()` abandons the Checkout attempt (aborting any request) and returns to `idle`.
- Each Checkout attempt has one Idempotency-Key: a retry after an error reuses it; `reset()` or a remount starts a new one. With `createSessionUrl`, a changed `payload` also starts a new one. With your own `createSession` the SDK can't see what you send, so call `reset()` when what the Customer is buying changes.
- With the default redirect, `state` stays `redirecting` while the Customer is in the browser, and returns to `idle` when they come back to the app without finishing.
- The returned `hostedUrl` must be `https:` (`http:` only on localhost), so a misconfigured Merchant backend can't open somewhere unexpected.

`<CheckoutButton>` takes the same options plus any `<Pressable>` props and a `ref`. It is unstyled. Its `onPress` runs first — return `false` (e.g. after failed validation) to stop the Checkout attempt.

### `useCheckoutReturn(options)`

```ts
const { state, session, error, refresh } = useCheckoutReturn<MySession>({ sessionId, retrieveSessionUrl: BACKEND });
```

| Option | |
|---|---|
| `retrieveSession` / `retrieveSessionUrl` | How to reach the Merchant backend (or set on the provider) |
| `sessionId` | The Checkout Session id from your router; `null` means none. Omit it to read it from the link that opened the app |
| `polling` | `{ intervalMs = 1500, maxIntervalMs = 8000, timeoutMs = 60000 }`; overrides the provider field by field |

- `state`: `idle` (still reading the launch link) `→ loading → polling → settled`, or `timed_out`, `error`, `missing`.
- `session` is whatever your Merchant backend returned, once it has a valid `status` (`pending`, `succeeded`, `failed`, `cancelled`). Type it with the generic if you return more than `{ id, status }`.
- `refresh()` starts the lookup again, e.g. after `error` or `timed_out`.

### Errors

Errors raised by the SDK are `TransxactReactNativeError` with a `code`: `config_missing`, `http_error` (with `status` and `body`), `invalid_response`. Errors thrown by your own functions pass through unchanged.

## Platform notes

- **No `crypto` needed.** React Native has none by default; the Idempotency-Key uses `crypto.randomUUID` when a polyfill provides it and `Math.random` otherwise (it only has to be unique, not secret).
- **No `URL` class needed.** React Native's built-in `URL` is incomplete, so the SDK handles URLs as plain strings.
- **Absolute URLs only.** There is no "current page" in an app, so `createSessionUrl` and `retrieveSessionUrl` must be absolute.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

Apache-2.0
