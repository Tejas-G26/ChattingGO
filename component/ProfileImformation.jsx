import { supabase } from "@/supabase";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authService } from "../services/authService";

export const ProfileImformation = ({ navigation }) => {
  const [image, setImage] = useState(null);
  const [me, setMe] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [uploading, setUploading] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [originalUsername, setOriginalUsername] = useState("");
  const [userId, setUserId] = useState(null);

  useFocusEffect(
    React.useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          return true; // Prevent going back
        }
      );

      return () => {
        // This is the correct way - use the subscription's remove method
        subscription.remove();
      };
    }, [])
  );

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setUserId(user.id);
        await fetchUserProfile(user.id);
      }
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("name, username, avatar_url")
        .eq("id", userId)
        .single();

      if (data && !error) {
        setName(data.name || "");
        setUsername(data.username || "");
        setOriginalUsername(data.username || "");
        if (data.username) {
          setUsernameAvailable(true);
        }
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const checkUsernameAvailability = async (usernameToCheck) => {
    if (!usernameToCheck || usernameToCheck.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const cleanUsername = usernameToCheck.toLowerCase().trim();

    if (
      originalUsername &&
      cleanUsername === originalUsername.toLowerCase().trim()
    ) {
      setUsernameAvailable(true);
      return;
    }

    setCheckingUsername(true);

    try {
      let query = supabase
        .from("profiles")
        .select("id, username")
        .eq("username", cleanUsername);

      if (userId) {
        query = query.neq("id", userId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error("Database error:", error);
        setUsernameAvailable(null);
        return;
      }

      if (data) {
        setUsernameAvailable(false);
      } else {
        setUsernameAvailable(true);
      }
    } catch (error) {
      console.error("Error checking username:", error);
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  };

  useEffect(() => {
    if (username && username.length >= 3) {
      const timer = setTimeout(() => {
        checkUsernameAvailability(username);
      }, 600);

      return () => clearTimeout(timer);
    } else {
      setUsernameAvailable(null);
    }
  }, [username, userId, originalUsername]);

  const PickImage = async () => {
    if (!user) {
      Alert.alert("Login Required", "Please log in to upload images");
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Sorry, we need camera roll permissions to make this work!"
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
      setMe("Image selected. Ready to upload!");
    }
  };

  const uploadImageAndUpdateProfile = async () => {
    if (!user) {
      Alert.alert(
        "Authentication Required",
        "You need to be logged in to update profile"
      );
      return;
    }

    if (!name.trim() || !username.trim()) {
      Alert.alert("Missing Information", "Please enter both name and username");
      return;
    }

    if (username.length < 3) {
      Alert.alert(
        "Invalid Username",
        "Username must be at least 3 characters long."
      );
      return;
    }

    const cleanUsername = username.toLowerCase().trim();
    const cleanOriginalUsername = originalUsername.toLowerCase().trim();

    if (
      usernameAvailable === false &&
      cleanUsername !== cleanOriginalUsername
    ) {
      Alert.alert(
        "Username Taken",
        "This username is already taken by another user."
      );
      return;
    }

    if (checkingUsername) {
      Alert.alert("Please Wait", "Checking username availability...");
      return;
    }

    try {
      setUploading(true);
      setMe("Updating profile...");

      let avatarUrl = null;

      if (image && image.base64) {
        const fileName = `${user.id}/${Date.now()}_avatar.jpg`;
        const base64String = image.base64;

        const binaryString = atob(base64String);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const arrayBuffer = bytes.buffer;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, arrayBuffer, {
            contentType: "image/jpeg",
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Image upload failed: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName);
        avatarUrl = urlData.publicUrl;
      }

      const { data, error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          name: name.trim(),
          username: cleanUsername,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .select();

      if (error) {
        if (error.code === "23505") {
          throw new Error(
            "This username is already taken by another user. Please choose a different one."
          );
        }
        throw error;
      }

      setMe("Profile updated successfully!");
      setOriginalUsername(cleanUsername);

      if (data && data[0]) {
      await authService.saveUserProfile(data[0]);
    }

      setImage(null);
    } catch (error) {
      console.error("Error:", error);
      Alert.alert("Update Failed", error.message);
    } finally {
      setUploading(false);
    }

    navigation.navigate("Home");
  };

  const isUpdateDisabled = () => {
    const cleanUsername = username.toLowerCase().trim();
    const cleanOriginalUsername = originalUsername.toLowerCase().trim();
    const isSameAsOriginal = cleanUsername === cleanOriginalUsername;

    return (
      uploading ||
      !name.trim() ||
      !username.trim() ||
      username.length < 3 ||
      checkingUsername ||
      (usernameAvailable === false && !isSameAsOriginal)
    );
  };

  const getUsernameStatusMessage = () => {
    if (checkingUsername) {
      return { text: "Checking availability...", color: "orange" };
    }

    if (!username) return { text: "", color: "transparent" };

    if (username.length < 3) {
      return { text: "Minimum 3 characters", color: "orange" };
    }

    if (usernameAvailable === true) {
      return { text: "Available", color: "green" };
    }

    if (usernameAvailable === false) {
      const cleanUsername = username.toLowerCase().trim();
      const cleanOriginalUsername = originalUsername.toLowerCase().trim();
      if (cleanUsername === cleanOriginalUsername) {
        return { text: "Your username", color: "green" };
      }
      return { text: "Username taken", color: "red" };
    }

    return { text: "", color: "transparent" };
  };

  const statusMessage = getUsernameStatusMessage();

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#171717ff",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#ffed2bff" />
        <Text style={{ marginTop: 10, fontSize: 16, color: "black" }}>
          Loading...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#171717ff" }}>
      <ScrollView>
        <View
          style={{
            flex: 1,
            paddingHorizontal: 25,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* Title */}
          <Text
            style={{
              fontSize: 40,
              fontWeight: "800",
              color: "white",
              marginBottom: 2,
              textAlign: "center",
            }}
          >
            Profile
          </Text>

          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              color: "white",
              marginBottom: 2,
              textAlign: "center",
            }}
          >
            Update your personal information
          </Text>

          {/* Status Message */}
          <Text
            style={{
              color:
                me.includes("Error") || me.includes("Failed") ? "red" : "green",
              fontSize: 16,
              marginBottom: 15,
              marginTop: 6,
              textAlign: "center",
              height: 20,
            }}
          >
            {me}
          </Text>

          {user ? (
            <View style={{ width: "100%", alignItems: "center" }}>
              {/* User Info */}
              <View
                style={{
                  backgroundColor: "white",
                  padding: 15,
                  borderRadius: 20,
                  marginBottom: 15,
                  borderWidth: 1,
                  borderColor: "black",
                  shadowColor: "#000",
                  shadowOpacity: 0.05,
                  shadowRadius: 3,
                  width: "100%",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: "#003a60ff",
                    textAlign: "center",
                    fontWeight: "600",
                  }}
                >
                  Logged in as {user.email}
                </Text>
              </View>

              {/* Profile Picture Section */}
              <View
                style={{
                  backgroundColor: "white",
                  padding: 20,
                  borderRadius: 20,
                  marginBottom: 15,
                  borderWidth: 1,
                  borderColor: "white",
                  shadowColor: "#fff",
                  shadowOpacity: 0.05,
                  shadowRadius: 3,
                  width: "100%",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#000",
                    marginBottom: 15,
                  }}
                >
                  Profile Picture
                </Text>

                {image ? (
                  <View style={{ alignItems: "center", marginBottom: 15 }}>
                    <Image
                      source={{ uri: image.uri }}
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: 50,
                        marginBottom: 10,
                        borderWidth: 2,
                        borderColor: "#13a776ff",
                      }}
                    />
                    <Text
                      style={{
                        color: "green",
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      New image selected
                    </Text>
                  </View>
                ) : (
                  <View
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: 50,
                      backgroundColor: "#f0f0f0",
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: 15,
                      borderWidth: 2,
                      borderColor: "#ddd",
                    }}
                  >
                    <Text
                      style={{
                        color: "#95A5A6",
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    >
                      No Image Selected
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={{
                    backgroundColor: "#ffed2bff",
                    width: "100%",
                    height: 50,
                    borderRadius: 50,
                    borderWidth: 1,
                    borderColor: "#000",
                    justifyContent: "center",
                    alignItems: "center",
                    shadowColor: "#ffed2bff",
                    shadowOpacity: 0.2,
                    shadowRadius: 6,
                  }}
                  onPress={PickImage}
                >
                  <Text
                    style={{ fontSize: 16, fontWeight: "700", color: "#000" }}
                  >
                    {image ? "Change Image" : "Select Profile Image"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Profile Form */}
              <View
                style={{
                  backgroundColor: "white",
                  padding: 20,
                  borderRadius: 20,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: "white",
                  shadowColor: "white",
                  shadowOpacity: 0.05,
                  shadowRadius: 3,
                  width: "100%",
                }}
              >
                {/* Full Name Input */}
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#000",
                    marginBottom: 8,
                  }}
                >
                  Full Name <Text style={{ color: "red" }}> *</Text>
                </Text>
                <TextInput
                  style={{
                    width: "100%",
                    height: 50,
                    backgroundColor: "white",
                    borderRadius: 20,
                    paddingLeft: 15,
                    fontSize: 16,
                    borderWidth: 2,
                    borderColor: "#000",
                    marginBottom: 15,
                  }}
                  placeholder="Enter your full name"
                  placeholderTextColor="#4c5252ff"
                  value={name}
                  onChangeText={setName}
                />

                {/* Username Input */}
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#000",
                    marginBottom: 8,
                  }}
                >
                  Username<Text style={{ color: "red" }}> *</Text>
                </Text>
                <TextInput
                  style={{
                    width: "100%",
                    height: 50,
                    backgroundColor: "white",
                    borderRadius: 20,
                    paddingLeft: 15,
                    fontSize: 16,
                    borderWidth: 2,
                    borderColor: "black",
                    borderColor: checkingUsername
                      ? "orange"
                      : usernameAvailable === false
                      ? "red"
                      : usernameAvailable === true
                      ? "green"
                      : "black",
                    marginBottom: 8,
                  }}
                  placeholder="Enter your username"
                  placeholderTextColor="#4c5252ff"
                  value={username}
                  onChangeText={(text) => setUsername(text.replace(/\s/g, ""))}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {/* Username Status */}
                {statusMessage.text ? (
                  <View style={{ marginBottom: 15 }}>
                    <Text
                      style={{
                        color: statusMessage.color,
                        fontSize: 14,
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                    >
                      {statusMessage.text}
                    </Text>
                  </View>
                ) : null}

                {/* Update Profile Button */}
                <TouchableOpacity
                  style={{
                    backgroundColor: isUpdateDisabled() ? "gray" : "#ffed2bff",
                    width: "100%",
                    height: 55,
                    borderRadius: 50,
                    borderWidth: 1,
                    borderColor: "white",
                    justifyContent: "center",
                    alignItems: "center",
                    marginTop: 10,
                    shadowColor: "#ffed2bff",
                    shadowOpacity: 0.2,
                    shadowRadius: 6,
                    opacity: isUpdateDisabled() ? 0.6 : 1,
                  }}
                  onPress={uploadImageAndUpdateProfile}
                  disabled={isUpdateDisabled()}
                >
                  {uploading ? (
                    <ActivityIndicator size="large" color="black" />
                  ) : (
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "700",
                        color: "black",
                      }}
                    >
                      Save
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Required Fields Info */}
                <Text
                  style={{
                    fontSize: 12,
                    color: "black",
                    marginTop: 15,
                    textAlign: "center",
                  }}
                >
                  * Required fields. Username must be unique and at least 3
                  characters long.
                </Text>
              </View>
            </View>
          ) : (
            /* Not Logged In State */
            <View
              style={{
                backgroundColor: "white",
                padding: 30,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "white",
                alignItems: "center",
                width: "100%",
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  marginBottom: 20,
                  textAlign: "center",
                  fontWeight: "600",
                  color: "#000",
                }}
              >
                Please log in to update your profile
              </Text>

              <TouchableOpacity
                style={{
                  backgroundColor: "#ffed2bff",
                  width: "100%",
                  height: 55,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#000",
                  justifyContent: "center",
                  alignItems: "center",
                }}
                onPress={() => navigation.navigate("Login")}
              >
                <Text
                  style={{ fontSize: 18, fontWeight: "700", color: "black" }}
                >
                  Go to Login
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ProfileImformation;
