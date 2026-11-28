import { Redirect } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
export default function IndexRoute() { const {status}=useAuth(); if(status==="loading") return null; return <Redirect href={status==="authenticated" ? "/(app)" : "/(auth)/login"}/>; }
