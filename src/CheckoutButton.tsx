import {
  type ComponentRef,
  type ForwardRefExoticComponent,
  forwardRef,
  type ReactNode,
  type RefAttributes,
} from 'react';
import {
  Pressable,
  type PressableProps,
  Text,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { type UseCheckoutOptions, useCheckout } from './useCheckout';

export type CheckoutButtonProps = Omit<
  PressableProps,
  'onPress' | 'children'
> &
  UseCheckoutOptions & {
    /** A string or number is wrapped in a `<Text>` for you; anything else is rendered as is. */
    children?: ReactNode;
    /** Style for the `<Text>` that wraps a string child. */
    textStyle?: StyleProp<TextStyle>;
    /** Runs first; return `false` (e.g. after failed validation) to stop the Checkout attempt. */
    onPress?: PressableProps['onPress'] | ((event: never) => false | void);
  };

/**
 * An unstyled `<Pressable>` that starts a Checkout attempt when pressed. Style it with `style`; while a
 * Checkout attempt is under way it is disabled and reports `busy` to screen readers.
 */
export const CheckoutButton: ForwardRefExoticComponent<
  CheckoutButtonProps & RefAttributes<ComponentRef<typeof Pressable>>
> = forwardRef<ComponentRef<typeof Pressable>, CheckoutButtonProps>(
  function CheckoutButton(
    {
      createSession,
      createSessionUrl,
      payload,
      onError,
      redirect,
      onPress,
      disabled,
      children,
      textStyle,
      accessibilityState,
      ...pressableProps
    },
    ref
  ) {
    const { start, state } = useCheckout({
      createSession,
      createSessionUrl,
      payload,
      onError,
      redirect,
    });
    const busy = state === 'creating' || state === 'redirecting';
    const isDisabled = Boolean(disabled) || busy;
    return (
      <Pressable
        accessibilityRole="button"
        {...pressableProps}
        ref={ref}
        disabled={isDisabled}
        accessibilityState={{
          ...accessibilityState,
          disabled: isDisabled,
          busy,
        }}
        onPress={(event) => {
          const result = (onPress as ((event: unknown) => unknown) | undefined)?.(
            event
          );
          if (result !== false) void start();
        }}
      >
        {typeof children === 'string' || typeof children === 'number' ? (
          <Text style={textStyle}>{children}</Text>
        ) : (
          children
        )}
      </Pressable>
    );
  }
);
