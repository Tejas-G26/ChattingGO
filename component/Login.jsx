import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authService } from "../services/authService";
import { supabase } from "../supabase";

const { width, height } = Dimensions.get("window");

export const Login = ({ navigation }) => {
  const [Email, setEmail] = useState("");
  const [Password, setPassword] = useState("");
  const [Message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    checkExistingSession();

    // Set up auth state listener for real-time updates
  const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event);
      
      if (event === "SIGNED_IN" && session) {
        await authService.saveSession(session);
        await handleUserRedirect(session.user);
      }
      
      if (event === "SIGNED_OUT") {
        await authService.clearSession();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUserRedirect = async (user) => {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("name, username")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Profile fetch error:", error);
        // If profile doesn't exist, go to profile setup
        navigation.reset({
          index: 0,
          routes: [{ name: "ProfileImformation" }],
        });
        return;
      }

      // Save profile to storage
      if (profile) {
        await authService.saveUserProfile(profile);
      }

      if (profile?.name && profile?.username) {
        // Profile complete, go to Home
        navigation.reset({
          index: 0,
          routes: [{ name: "Home" }],
        });
      } else {
        // Profile incomplete, go to ProfileInformation
        navigation.reset({
          index: 0,
          routes: [{ name: "ProfileImformation" }],
        });
      }
    } catch (error) {
      console.error("Redirect error:", error);
      // On error, stay on login
      setCheckingSession(false);
    }
  };

  // NEW: Improved session checking
  const checkExistingSession = async () => {
    try {
      // First check our service for valid session
      const session = await authService.getValidSession();
      
      if (session?.user) {
        // We have a valid session, redirect
        await handleUserRedirect(session.user);
        return;
      }
      
      // No valid session found
      setCheckingSession(false);
    } catch (error) {
      console.error("Session check error:", error);
      setCheckingSession(false);
    }
  };

  const login_Supabase = async () => {
    if (!Email.trim() || !Password.trim()) {
      setMessage("Enter email and password");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: Email.trim().toLowerCase(),
        password: Password,
      });

      if (error) {
        setMessage("Login Error: " + error.message);
        setLoading(false);
        return;
      }

      if (data.user && data.session) {
        // Save session immediately
        await authService.saveSession(data.session);
        setMessage("Login Successful");
        // The auth state change listener will handle redirect
      }
    } catch (error) {
      setMessage("Login failed. Please try again.");
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking session
  if (checkingSession) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#ffed2bff" />
        <Text
          style={{
            marginTop: height * 0.02,
            fontSize: width * 0.04,
            color: "white",
          }}
        >
          Checking...
        </Text>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#171717ff" }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: width * 0.06,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Title */}
        <Text
          style={{
            fontSize: width * 0.1,
            fontWeight: "800",
            color: "#fff",
            marginBottom: height * 0.01,
          }}
        >
          Welcome Back
        </Text>

        <Text
          style={{
            fontSize: width * 0.045,
            color: "#ffed2bff",
            marginBottom: height * 0.04,
            fontWeight: "600",
          }}
        >
          Login to your account
        </Text>

        {/* Error Message */}
        {Message ? (
          <Text
            style={{
              color: Message.includes("Successful") ? "green" : "red",
              fontSize: width * 0.04,
              marginBottom: height * 0.02,
              textAlign: "center",
            }}
          >
            {Message}
          </Text>
        ) : null}

        {/* Email Input */}
        <TextInput
          placeholder="Email"
          placeholderTextColor="#4c4f4fff"
          value={Email}
          onChangeText={setEmail}
          style={{
            width: "100%",
            height: height * 0.07,
            backgroundColor: "white",
            borderRadius: 20,
            paddingLeft: width * 0.04,
            fontSize: width * 0.04,
            borderWidth: 1,
            borderColor: "#fff",
            marginBottom: height * 0.02,
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        {/* Password Input */}
        <TextInput
          placeholder="Password"
          placeholderTextColor="#4c4f4fff"
          secureTextEntry={true}
          value={Password}
          onChangeText={setPassword}
          style={{
            width: "100%",
            height: height * 0.07,
            backgroundColor: "white",
            borderRadius: 20,
            paddingLeft: width * 0.04,
            paddingRight: width * 0.04,
            fontSize: width * 0.04,
            borderWidth: 1,
            borderColor: "white",
            marginBottom: height * 0.02,
          }}
          autoComplete="password"
        />

        {/* Login Button */}
        <TouchableOpacity
          style={{
            backgroundColor: "#ffed2bff",
            width: "100%",
            height: height * 0.07,
            borderRadius: 50,
            borderWidth: 1,
            borderColor: "black",
            justifyContent: "center",
            alignItems: "center",
            marginTop: height * 0.02,
            opacity: loading ? 0.7 : 1,
          }}
          onPress={login_Supabase}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="large" color="black" />
          ) : (
            <Text
              style={{
                fontSize: width * 0.05,
                fontWeight: "700",
                color: "black",
              }}
            >
              Login
            </Text>
          )}
        </TouchableOpacity>

        {/* Navigation text */}
        <View style={{ flexDirection: "row", marginTop: height * 0.03 }}>
          <Text
            style={{
              color: "white",
              fontSize: width * 0.04,
              fontWeight: "400",
            }}
          >
            I don't have an account?
          </Text>

          <TouchableOpacity onPress={() => navigation.navigate("Register")}>
            <Text
              style={{
                fontSize: width * 0.04,
                color: "#ffed2bff",
                marginLeft: width * 0.02,
                fontWeight: "600",
              }}
            >
              Register
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default Login;
