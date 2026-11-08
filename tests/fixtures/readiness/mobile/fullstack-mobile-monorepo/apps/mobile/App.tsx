import React, { Component, ReactNode } from 'react';
import { View, Text } from 'react-native';

export class ErrorBoundary extends Component<{ children?: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <Text>Error</Text>;
    return this.props.children;
  }
}

export default function MobileApp() {
  return (
    <ErrorBoundary>
      <View>
        <Text>Mobile App in Monorepo</Text>
      </View>
    </ErrorBoundary>
  );
}
