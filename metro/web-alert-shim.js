/**
 * Drop-in replacement for react-native-web's `Alert` module, wired in only
 * for Metro's web bundle (see metro.config.js).
 *
 * react-native-web ships `Alert.alert()` as a literal no-op —
 * node_modules/react-native-web/dist/exports/Alert/index.js is just
 * `class Alert { static alert() {} }` — so every confirm/destructive dialog
 * in this app (logout, delete account, delete task/class/habit/chat, clear
 * notifications, ...) silently does nothing on web: the button that should
 * open it does not error, it just has no visible effect. This backs the same
 * `Alert.alert(title, message, buttons)` call with the browser's built-in
 * confirm()/alert(), so those flows are actually reachable by a real user
 * (and by Playwright, which can drive `window.confirm`/`alert` via its
 * `page.on('dialog')` API).
 *
 * Native builds are unaffected: this file is only ever selected by the
 * platform-guarded resolver override in metro.config.js, never by iOS/
 * Android bundling. It also never touches Vitest, which resolves `Alert`
 * via its own jsdom-based alias in vitest.config.ts, not through Metro.
 */
class Alert {
  static alert(title, message, buttons) {
    const text = [title, message].filter(Boolean).join('\n\n');

    if (!buttons || buttons.length === 0) {
      window.alert(text);
      return;
    }
    if (buttons.length === 1) {
      window.alert(text);
      buttons[0].onPress?.();
      return;
    }

    const cancelIndex = buttons.findIndex((b) => b.style === 'cancel');
    const confirmed = window.confirm(text);
    if (confirmed) {
      const confirmButton = buttons.find((_b, i) => i !== cancelIndex) ?? buttons[buttons.length - 1];
      confirmButton?.onPress?.();
    } else if (cancelIndex >= 0) {
      buttons[cancelIndex]?.onPress?.();
    }
  }

  static prompt() {
    // Not used anywhere in this app; left unimplemented like upstream.
  }
}

export default Alert;
