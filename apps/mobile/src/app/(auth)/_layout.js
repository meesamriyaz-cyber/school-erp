import { Stack, Redirect } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
export default function AuthLayout() { const {status}=useAuth(); if(status==="loading") return null; if(status==="authenticated") return <Redirect href="/(app)"/>; return <Stack screenOptions={{headerShown:false}}/>; }
