import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

function tabIcon(outline: IoniconName, solid: IoniconName) {
  return function TabIcon({ color, focused, size }: { color: string; focused: boolean; size: number }) {
    return <Ionicons name={focused ? solid : outline} size={size} color={color} />;
  };
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom > 0 ? insets.bottom : 12;
  const { Palette } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: Palette.primary,
        tabBarInactiveTintColor: Palette.subtle,
        tabBarLabelStyle: {
          fontFamily: FontFamily,
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarItemStyle: { paddingTop: 8 },
        tabBarStyle: {
          height: 60 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 6,
          backgroundColor: Palette.card,
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          position: 'absolute',
          shadowColor: '#3A2E7A',
          shadowOpacity: 0.1,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: -6 },
          elevation: 16,
          ...Platform.select({ android: { paddingBottom: bottomPad + 2 } }),
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: tabIcon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen
        name="timetable"
        options={{
          title: 'Timetable',
          tabBarIcon: tabIcon('calendar-outline', 'calendar'),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: tabIcon('checkbox-outline', 'checkbox'),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: tabIcon('stats-chart-outline', 'stats-chart'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabIcon('person-outline', 'person'),
        }}
      />
      {/* Default template route — kept in the tree but hidden from the tab bar. */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
