import { Stack } from 'expo-router';

import { TripProvider } from '../state/TripContext';

export default function RootLayout() {
  return (
    <TripProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </TripProvider>
  );
}
