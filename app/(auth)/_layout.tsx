import { Stack } from 'expo-router';

import { useAppTheme } from '@/hooks/use-app-theme';

export default function AuthLayout() {
  const { Palette } = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: Palette.bg },
      }}
    />
  );
}
