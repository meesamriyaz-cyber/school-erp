import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../auth/AuthProvider";
import { colors } from "../theme/tokens";
export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><StatusBar style="dark" backgroundColor={colors.background}/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background},animation:"fade"}}><Stack.Screen name="index"/><Stack.Screen name="(auth)"/><Stack.Screen name="(app)"/></Stack></AuthProvider></SafeAreaProvider>;
}
