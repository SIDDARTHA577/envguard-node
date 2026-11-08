import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_SECRET = "sk_live_supersecret_production_key_123456789";

export default function App() {
  useEffect(() => {
    async function login() {
      const userToken = "jwt.header.payload.signature";
      await AsyncStorage.setItem('token', userToken);
      console.log("Logged in with token:", userToken);
    }
    login();
  }, []);

  return (
    <View>
      <Text>Defective Expo App</Text>
    </View>
  );
}
