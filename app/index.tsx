import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as React from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Chatting } from "../component/Chatting";
import { Home } from "../component/Home";
import { Login } from "../component/Login";
import { Profile } from "../component/Profile";
import { ProfileImformation } from "../component/ProfileImformation";
import { Register } from "../component/Register";
import { Welcome } from "../component/Welcome";
import { authService } from "../services/authService";
import { supabase } from "../supabase"; // IMPORTANT: ADD THIS LINE

const Stack = createNativeStackNavigator();

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState("Welcome");

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Check if user has valid session
      const session = await authService.getValidSession();
      
      if (!session?.user) {
        // No session, show Welcome screen
        setInitialRoute("Welcome");
        setIsLoading(false);
        return;
      }

      // User has session, check profile status
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("name, username")
        .eq("id", session.user.id)
        .single();

      if (error || !profile) {
        // No profile exists, go to ProfileImformation
        setInitialRoute("ProfileImformation");
      } else if (!profile?.name || !profile?.username) {
        // Profile exists but incomplete
        setInitialRoute("ProfileImformation");
      } else {
        // Profile complete, go to Home
        setInitialRoute("Home");
      }
    } catch (error) {
      console.error("Auth check error:", error);
      // On error, show Welcome screen
      setInitialRoute("Welcome");
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading indicator while checking auth
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#171717ff" }}>
        <ActivityIndicator size="large" color="#ffed2bff" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRoute} // DYNAMIC INITIAL ROUTE
    >
      <Stack.Screen name="Welcome" component={Welcome} />
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="Register" component={Register} />
      <Stack.Screen name="Profile" component={Profile} />
      <Stack.Screen name="Home" component={Home} />
      <Stack.Screen name="Chatting" component={Chatting} />
      <Stack.Screen name="ProfileImformation" component={ProfileImformation} />
    </Stack.Navigator>
  );
};

export default App;