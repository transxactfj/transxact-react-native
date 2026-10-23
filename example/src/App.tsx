import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CheckoutButton,
  TransxactProvider,
  useCheckoutReturn,
  type CheckoutSessionStatus,
} from '@transxact/react-native';

type Outcome = Exclude<CheckoutSessionStatus, 'pending'>;

const OUTCOMES: Outcome[] = ['succeeded', 'failed', 'cancelled'];

const MESSAGES: Record<Outcome, string> = {
  succeeded: 'Paid — thank you!',
  failed: "The payment didn't go through.",
  cancelled: 'The payment was cancelled.',
};

// Set EXPO_PUBLIC_BACKEND_URL (see backend/server.mjs) to use a real Merchant backend with an sk_test_ key.
// Leave it unset to use the mock below, which needs no server.
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Mock Merchant backend: stands in for your server (which would use @transxact/node).
const createSession = async ({ idempotencyKey }: { idempotencyKey: string }) => {
  console.log('createSession, Idempotency-Key:', idempotencyKey);
  await new Promise((r) => setTimeout(r, 500));
  return { id: 'cs_test_123', hostedUrl: 'https://example.com' };
};

function ReturnScreen({
  sessionId,
  retrieveSession,
}: {
  sessionId: string;
  // Omitted with a real backend: the provider's retrieveSessionUrl is used.
  retrieveSession?: (id: string) => Promise<{ id: string; status: CheckoutSessionStatus }>;
}) {
  const { state, session, refresh } = useCheckoutReturn({ sessionId, retrieveSession });
  const status = session?.status;
  return (
    <View style={styles.box}>
      <Text>state: {state}</Text>
      <Text>payment: {status ?? '—'}</Text>
      {state === 'settled' && status && status !== 'pending' && (
        <Text style={styles.message}>{MESSAGES[status]}</Text>
      )}
      <Button title="Refresh" onPress={refresh} />
    </View>
  );
}

function RealBackend() {
  const [sessionId, setSessionId] = useState('');
  const [checking, setChecking] = useState<string | null>(null);

  return (
    <TransxactProvider createSessionUrl={BACKEND_URL} retrieveSessionUrl={BACKEND_URL}>
      <View style={styles.container}>
        <Text>Backend: {BACKEND_URL}</Text>
        <CheckoutButton
          payload={{ orderId: 'order_1001' }}
          style={styles.button}
          textStyle={styles.buttonText}
        >
          Pay with M-PAiSA or MyCash
        </CheckoutButton>

        {/* Drive the session to an outcome with the test-transition call (see the guide), then check it here. */}
        <TextInput
          style={styles.input}
          value={sessionId}
          onChangeText={setSessionId}
          placeholder="cs_… (the session id)"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          title="Check this payment"
          disabled={!sessionId}
          onPress={() => setChecking(sessionId)}
        />
        {checking && <ReturnScreen key={checking} sessionId={checking} />}
      </View>
    </TransxactProvider>
  );
}

export default function App() {
  return BACKEND_URL ? <RealBackend /> : <MockBackend />;
}

function MockBackend() {
  const [outcome, setOutcome] = useState<Outcome>('succeeded');
  // Bumping this remounts the Return screen, so each run starts polling from scratch.
  const [run, setRun] = useState(0);

  // pending for the first 2 lookups, then the chosen outcome, to exercise polling
  const makeRetrieveSession = () => {
    let polls = 0;
    return async (sessionId: string) => {
      polls += 1;
      console.log('retrieveSession', sessionId, polls);
      return { id: sessionId, status: polls < 3 ? ('pending' as const) : outcome };
    };
  };

  const [retrieveSession, setRetrieveSession] = useState(makeRetrieveSession);

  return (
    <TransxactProvider createSession={createSession}>
      <View style={styles.container}>
        <CheckoutButton
          payload={{ orderId: 'order_123' }}
          style={styles.button}
          textStyle={styles.buttonText}
        >
          Pay with M-PAiSA or MyCash
        </CheckoutButton>

        <Text>Outcome the mock backend returns:</Text>
        <View style={styles.row}>
          {OUTCOMES.map((o) => (
            <Button
              key={o}
              title={o === outcome ? `● ${o}` : o}
              onPress={() => setOutcome(o)}
            />
          ))}
        </View>

        {/* Simulates the Customer coming back via the app link (?session_id=cs_…) */}
        <Button
          title="Simulate return from checkout"
          onPress={() => {
            setRetrieveSession(() => makeRetrieveSession());
            setRun((n) => n + 1);
          }}
        />
        {run > 0 && (
          <ReturnScreen
            key={run}
            sessionId="cs_test_123"
            retrieveSession={retrieveSession}
          />
        )}
      </View>
    </TransxactProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  button: { backgroundColor: '#111', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  box: { alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 8, minWidth: 260 },
  message: { fontWeight: '600' },
});
