import { Redirect } from 'expo-router';

// Password resets happen via the Firebase reset email link, not in-app.
// Kept as a safe redirect so any stale navigation lands on login.
export default function ResetPasswordScreen() {
  return <Redirect href="/login" />;
}
