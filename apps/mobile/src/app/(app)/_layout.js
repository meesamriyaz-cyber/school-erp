import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
export default function ProtectedLayout() { const {status}=useAuth(); if(status==="loading") return null; if(status!=="authenticated") return <Redirect href="/(auth)/login"/>; return <Stack screenOptions={{headerShown:false}}/>; }
