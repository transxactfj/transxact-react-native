import { StyleSheet, Text, View } from 'react-native';
import {
  CheckoutButton,
  TransxactProvider,
  useCheckoutReturn,
} from '@transxact/react-native';

// Your Merchant backend, which holds the Transxact secret key (see the README).
const BACKEND = 'https://shop.example/api/checkout';

function ReturnStatus() {
  const { state, session } = useCheckoutReturn();
  if (state === 'missing' || state === 'idle') return null;
  return <Text>{session ? `Payment ${session.status}` : `Checking… (${state})`}</Text>;
}

export default function App() {
  return (
    <TransxactProvider createSessionUrl={BACKEND} retrieveSessionUrl={BACKEND}>
      <View style={styles.container}>
        <CheckoutButton
          payload={{ orderId: 'order_123' }}
          style={styles.button}
          textStyle={styles.buttonText}
        >
          Pay with M-PAiSA or MyCash
        </CheckoutButton>
        <ReturnStatus />
      </View>
    </TransxactProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  button: {
    backgroundColor: '#111',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
