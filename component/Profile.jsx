import { supabase } from "@/supabase";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { authService } from "../services/authService";

const { width, height } = Dimensions.get("window");

export const Profile = ({ navigation }) => {
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
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(null);

  const MAX_NAME_LENGTH = 50;
  const MAX_USERNAME_LENGTH = 20;

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
        setCurrentAvatarUrl(data.avatar_url);

        if (data.avatar_url) {
          setImage({ uri: data.avatar_url });
        }

        if (data.username) {
          setUsernameAvailable(true);
        }
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: performLogout,
      },
    ]);
  };

  const performLogout = async () => {
  try {
    setLoading(true);
    
    // Clear from auth service first
    await authService.clearSession();
    
    // Then sign out from Supabase
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // Clear local state
    setUser(null);
    setUserId(null);
    setName("");
    setUsername("");
    setOriginalUsername("");
    setImage(null);
    setCurrentAvatarUrl(null);
    setUsernameAvailable(null);

    // Navigate to Welcome screen
    navigation.reset({
      index: 0,
      routes: [{ name: "Welcome" }],
    });
  } catch (error) {
    console.error("Logout error:", error);
    Alert.alert("Error", "Logout failed. Please try again.");
  } finally {
    setLoading(false);
  }
};

  const validateUsername = (username) => {
    const regex = /^[a-zA-Z0-9_]+$/;
    return regex.test(username);
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

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
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
        quality: 0.7,
        base64: true,
        exif: false,
      });

      if (!result.canceled) {
        setImage(result.assets[0]);
        setMe("Image selected. Ready to upload!");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
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

    if (!validateUsername(username)) {
      Alert.alert(
        "Invalid Username",
        "Username can only contain letters, numbers, and underscores."
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

      let avatarUrl = currentAvatarUrl;

      if (image && image.base64 && !image.uri?.includes("supabase.co")) {
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
      setCurrentAvatarUrl(avatarUrl);

       if (data && data[0]) {
      await authService.saveUserProfile(data[0]);
    }

      Alert.alert("Success", "Profile updated successfully!", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error("Error:", error);
      Alert.alert("Update Failed", error.message);
    } finally {
      setUploading(false);
    }
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
      (usernameAvailable === false && !isSameAsOriginal) ||
      !validateUsername(username)
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

    if (!validateUsername(username)) {
      return { text: "Only letters, numbers, underscore", color: "red" };
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
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ffed2bff" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>
              <Icon name="chevron-back" size={24} color="white" />
            </Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Edit Profile</Text>

          {user && (
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <Icon name="log-out-outline" size={25} color="white" />
            </TouchableOpacity>
          )}
        </View>

        {/* Status Message */}
        <Text
          style={[
            styles.statusMessage,
            {
              color:
                me.includes("Error") || me.includes("Failed") ? "red" : "green",
            },
          ]}
        >
          {me}
        </Text>

        {user ? (
          <View style={styles.content}>
            {/* User Info Card */}
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Account Information</Text>
              <Text style={styles.infoCardText}>Logged in as {user.email}</Text>
            </View>

            {/* Profile Picture Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Profile Picture</Text>

              <View style={styles.avatarContainer}>
                {image ? (
                  <View style={styles.avatarWrapper}>
                    <Image
                      source={{ uri: image.uri }}
                      style={styles.avatarImage}
                    />
                    <Text style={styles.avatarStatus}>
                      {image.uri?.includes("supabase.co")
                        ? "Current profile image"
                        : "New image selected"}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarPlaceholderText}>
                      No Image{"\n"}Selected
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.imageButton}
                  onPress={PickImage}
                >
                  <Text style={styles.imageButtonText}>
                    {image ? "Change Image" : "Select Profile Image"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Profile Form */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personal Information</Text>

              {/* Full Name Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your full name"
                  placeholderTextColor="#95A5A6"
                  value={name}
                  onChangeText={setName}
                  maxLength={MAX_NAME_LENGTH}
                />
                <Text style={styles.charCount}>
                  {name.length}/{MAX_NAME_LENGTH}
                </Text>
              </View>

              {/* Username Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Username</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      borderColor: checkingUsername
                        ? "orange"
                        : usernameAvailable === false
                        ? "red"
                        : usernameAvailable === true
                        ? "green"
                        : "black",
                      borderWidth: 2,
                    },
                  ]}
                  placeholder="Enter your username"
                  placeholderTextColor="#95A5A6"
                  value={username}
                  onChangeText={(text) => {
                    const cleanText = text.replace(/\s/g, "");
                    if (validateUsername(cleanText) || cleanText === "") {
                      setUsername(cleanText);
                    }
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={MAX_USERNAME_LENGTH}
                />
                <Text style={styles.charCount}>
                  {username.length}/{MAX_USERNAME_LENGTH}
                </Text>

                {/* Username Status */}
                {statusMessage.text ? (
                  <View style={styles.statusContainer}>
                    <Text
                      style={[
                        styles.statusText,
                        { color: statusMessage.color },
                      ]}
                    >
                      {statusMessage.text}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Update Button */}
              <TouchableOpacity
                style={[
                  styles.updateButton,
                  isUpdateDisabled() && styles.updateButtonDisabled,
                ]}
                onPress={uploadImageAndUpdateProfile}
                disabled={isUpdateDisabled()}
              >
                {uploading ? (
                  <ActivityIndicator size="large" color="black" />
                ) : (
                  <Text style={styles.updateButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>

              {/* Info Text */}
              <Text style={styles.infoText}>
                Username must be 3-20 characters, letters/numbers/underscore
                only.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.notLoggedInContainer}>
            <Text style={styles.notLoggedInTitle}>
              Please log in to edit your profile
            </Text>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => navigation.navigate("Login")}
            >
              <Text style={styles.loginButtonText}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#171717ff",
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: height * 0.02,
    fontSize: width * 0.04,
    color: "white",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: width * 0.04,
    paddingVertical: height * 0.02,
    backgroundColor: "#171717ff",
    borderBottomWidth: 1,
    borderBottomColor: "#666",
  },
  backButton: {
    padding: width * 0.02,
  },
  backButtonText: {
    fontSize: width * 0.04,
    color: "white",
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: width * 0.05,
    fontWeight: "800",
    color: "white",
  },
  logoutButton: {
    backgroundColor: "#ff4444",
    paddingHorizontal: width * 0.04,
    paddingVertical: height * 0.01,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "black",
    flexDirection: "row",
  },
  statusMessage: {
    fontSize: width * 0.035,
    marginBottom: height * 0.01,
    textAlign: "center",
    height: height * 0.03,
    marginTop: height * 0.01,
  },
  content: {
    padding: width * 0.04,
  },
  infoCard: {
    backgroundColor: "white",
    padding: width * 0.05,
    borderRadius: 20,
    marginBottom: height * 0.02,
    borderWidth: 1,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  infoCardTitle: {
    fontSize: width * 0.045,
    fontWeight: "700",
    color: "black",
    marginBottom: height * 0.01,
  },
  infoCardText: {
    fontSize: width * 0.04,
    color: "#054124ff",
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#fff",
    padding: width * 0.05,
    borderRadius: 20,
    marginBottom: height * 0.02,
    borderWidth: 1,
    borderColor: "white",
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: width * 0.045,
    fontWeight: "700",
    color: "black",
    marginBottom: height * 0.02,
  },
  avatarContainer: {
    alignItems: "center",
  },
  avatarWrapper: {
    alignItems: "center",
    marginBottom: height * 0.02,
  },
  avatarImage: {
    width: width * 0.25,
    height: width * 0.25,
    borderRadius: width * 0.125,
    marginBottom: height * 0.01,
    borderWidth: 3,
    borderColor: "#ffed2bff",
  },
  avatarStatus: {
    color: "#0a8e1eff",
    fontSize: width * 0.035,
    fontWeight: "500",
    textAlign: "center",
  },
  avatarPlaceholder: {
    width: width * 0.25,
    height: width * 0.25,
    borderRadius: width * 0.125,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: height * 0.02,
    borderWidth: 2,
    borderColor: "#ddd",
  },
  avatarPlaceholderText: {
    color: "#95A5A6",
    fontSize: width * 0.03,
    textAlign: "center",
    fontWeight: "600",
  },
  imageButton: {
    backgroundColor: "#f3f321ff",
    width: "100%",
    height: height * 0.06,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "black",
    justifyContent: "center",
    alignItems: "center",
  },
  imageButtonText: {
    fontSize: width * 0.04,
    fontWeight: "700",
    color: "#000",
  },
  inputGroup: {
    marginBottom: height * 0.02,
  },
  inputLabel: {
    fontSize: width * 0.04,
    fontWeight: "700",
    color: "white",
    marginBottom: height * 0.01,
  },
  textInput: {
    width: "100%",
    height: height * 0.06,
    backgroundColor: "#fcfcfcff",
    borderRadius: 20,
    paddingLeft: width * 0.04,
    fontSize: width * 0.04,
    borderWidth: 2,
    borderColor: "#000",
    marginBottom: height * 0.005,
  },
  charCount: {
    fontSize: width * 0.03,
    color: "#666",
    alignSelf: "flex-end",
  },
  statusContainer: {
    marginTop: height * 0.01,
  },
  statusText: {
    fontSize: width * 0.035,
    fontWeight: "600",
    textAlign: "center",
  },
  updateButton: {
    backgroundColor: "#ffed2bff",
    width: "100%",
    height: height * 0.07,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "black",
    justifyContent: "center",
    alignItems: "center",
    marginTop: height * 0.01,
    marginBottom: height * 0.02,
  },
  updateButtonDisabled: {
    backgroundColor: "gray",
    opacity: 0.6,
  },
  updateButtonText: {
    fontSize: width * 0.045,
    fontWeight: "700",
    color: "black",
  },
  infoText: {
    fontSize: width * 0.03,
    color: "#141414ff",
    textAlign: "center",
  },
  notLoggedInContainer: {
    backgroundColor: "#000",
    padding: width * 0.08,
    borderRadius: 12,
    margin: width * 0.04,
    borderWidth: 1,
    borderColor: "black",
    alignItems: "center",
  },
  notLoggedInTitle: {
    fontSize: width * 0.045,
    marginBottom: height * 0.03,
    textAlign: "center",
    fontWeight: "600",
    color: "white",
  },
  loginButton: {
    backgroundColor: "#ffed2bff",
    width: "100%",
    height: height * 0.07,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "black",
    justifyContent: "center",
    alignItems: "center",
  },
  loginButtonText: {
    fontSize: width * 0.045,
    fontWeight: "700",
    color: "black",
  },
  bottomSpacer: {
    height: height * 0.05,
  },
});

export default Profile;
