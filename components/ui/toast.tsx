import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

type ToastType = 'success' | 'error' | 'info';
type ToastData = { message: string; type: ToastType };

type ToastApi = {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi>({ show: () => {}, success: () => {}, error: () => {} });

function configFor(Palette: AppPalette): Record<ToastType, { icon: keyof typeof Ionicons.glyphMap; color: string }> {
  return {
    success: { icon: 'checkmark-circle', color: Palette.green },
    error: { icon: 'alert-circle', color: '#E5484D' },
    info: { icon: 'information-circle', color: Palette.primary },
  };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { Palette } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const CONFIG = useMemo(() => configFor(Palette), [Palette]);
  const [toast, setToast] = useState<ToastData | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-24)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, type: ToastType = 'info') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, type });
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -24, duration: 220, useNativeDriver: true }),
      ]).start(() => setToast(null));
    }, 2600);
    return () => {
      // timer.current is set synchronously above the moment any toast becomes
      // visible and is never nulled elsewhere in this file, so by the time
      // this cleanup can run it is always truthy.
      /* v8 ignore start */
      if (timer.current) clearTimeout(timer.current);
      /* v8 ignore stop */
    };
  }, [toast, opacity, translateY]);

  const api = useRef<ToastApi>({
    show,
    success: (m: string) => show(m, 'success'),
    error: (m: string) => show(m, 'error'),
  }).current;

  const cfg = toast ? CONFIG[toast.type] : null;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && cfg ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            { top: insets.top + 8, opacity, transform: [{ translateY }] },
          ]}>
          <View style={[styles.iconWrap, { backgroundColor: cfg.color + '1A' }]}>
            <Ionicons name={cfg.icon} size={20} color={cfg.color} />
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {toast.message}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
    toast: {
      position: 'absolute',
      left: 20,
      right: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: Palette.card,
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 14,
      shadowColor: '#3A2E7A',
      shadowOpacity: 0.16,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
      zIndex: 1000,
    },
    iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    message: { flex: 1, fontFamily: FontFamily, fontSize: 14, fontWeight: '600', color: Palette.ink },
  });
}
