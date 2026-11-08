import React, { Component, ReactNode, useEffect } from 'react';
import { View, Text, AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: unknown) {
    // Log error to telemetry
  }

  render() {
    if (this.state.hasError) {
      return (
        <View>
          <Text>Something went wrong. Please restart the app.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  useEffect(() => {
    async function storeSession() {
      await SecureStore.setItemAsync('userToken', 'secure-entropy-token-12345');
    }
    storeSession();

    const unsubscribeNet = NetInfo.addEventListener((_state) => {
      // Monitor offline connection
    });

    const subAppState = AppState.addEventListener('change', (_nextAppState: AppStateStatus) => {
      // Handle background/foreground transition
    });

    return () => {
      unsubscribeNet();
      subAppState.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <View>
        <Text>Healthy Expo Application</Text>
      </View>
    </ErrorBoundary>
  );
}
