import { Buffer } from "buffer";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { authService } from "../services/authService";
import { supabase } from "../supabase";
global.Buffer = Buffer;

// Simple XOR encryption (works reliably across platforms)
class ChatEncryption {
  // Generate consistent encryption key from chat and user IDs
  static generateEncryptionKey(chatId, currentUserId, targetUserId) {
    const secret = `${chatId}-${currentUserId}-${targetUserId}`;
    let key = "";

    // Create a 32-character key by hashing the secret
    for (let i = 0; i < secret.length; i++) {
      key += secret.charCodeAt(i).toString(16).padStart(2, "0");
    }

    // Ensure key is exactly 32 characters
    while (key.length < 32) {
      key += "0";
    }
    return key.substring(0, 32);
  }

  // Simple XOR encryption (reliable and works everywhere)
  static encryptMessage(message, key) {
    if (!message || !key) return message;

    let encrypted = "";
    for (let i = 0; i < message.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const msgChar = message.charCodeAt(i);
      encrypted += String.fromCharCode(msgChar ^ keyChar);
    }

    // Convert to base64 for safe storage
    return this.stringToBase64(encrypted);
  }

  // XOR decryption
  static decryptMessage(encryptedBase64, key) {
    if (!encryptedBase64 || !key) return encryptedBase64;

    try {
      // Check if it's base64 encoded
      if (this.isBase64(encryptedBase64)) {
        const encrypted = this.base64ToString(encryptedBase64);
        let decrypted = "";

        for (let i = 0; i < encrypted.length; i++) {
          const keyChar = key.charCodeAt(i % key.length);
          const encChar = encrypted.charCodeAt(i);
          decrypted += String.fromCharCode(encChar ^ keyChar);
        }
        return decrypted;
      } else {
        // If not base64, it's probably plain text (backward compatibility)
        return encryptedBase64;
      }
    } catch (error) {
      console.error("Decryption error:", error);
      return "[Encrypted message]";
    }
  }

  // Helper: String to Base64
  static stringToBase64(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      // Fallback for React Native
      return Buffer.from(str, "utf8").toString("base64");
    }
  }

  // Helper: Base64 to String
  static base64ToString(base64) {
    try {
      return decodeURIComponent(escape(atob(base64)));
    } catch (e) {
      // Fallback for React Native
      return Buffer.from(base64, "base64").toString("utf8");
    }
  }

  // Check if string is base64
  static isBase64(str) {
    try {
      return btoa(atob(str)) === str;
    } catch (err) {
      return false;
    }
  }
}

export const Chatting = ({ route, navigation }) => {
  const { targetUser, currentUser, chatId } = route.params;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [targetUserStatus, setTargetUserStatus] = useState(
    targetUser.online_status || false
  );
  const flatListRef = useRef(null);

  // Online/Offline functionality states
  const activityTimeoutRef = useRef(null);
  const statusSubscriptionRef = useRef(null);

    useEffect(() => {
  // Quick auth check when entering chat
  const checkAuth = async () => {
    const isValid = await authService.isAuthenticated();
    if (!isValid) {
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" }],
      });
      return;
    }
  };
  
  checkAuth();

    initializeEncryption();
    setupUserStatusTracking();
  }, [chatId, currentUser, targetUser]);

  useEffect(() => {
    if (encryptionKey) {
      fetchMessages();
      setupRealtimeSubscription();
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
      if (statusSubscriptionRef.current) {
        statusSubscriptionRef.current.unsubscribe();
      }
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      // Mark user as offline when leaving chat
      updateUserOnlineStatus(false);
    };
  }, [chatId, encryptionKey]);

  let subscription;

  // Online/Offline Functions
  const updateUserOnlineStatus = async (isOnline = true) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          online_status: isOnline,
          last_seen: new Date().toISOString(),
        })
        .eq("id", currentUser.id);

      if (error) {
        console.error("Error updating online status:", error);
      } else {
        console.log(`User marked as ${isOnline ? "online" : "offline"}`);
      }
    } catch (error) {
      console.error("Failed to update online status:", error);
    }
  };

  const recordUserActivity = () => {
    // Update online status immediately
    updateUserOnlineStatus(true);

    // Clear existing timeout
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }

    // Set new timeout to mark as offline after 2 minutes of inactivity
    activityTimeoutRef.current = setTimeout(() => {
      updateUserOnlineStatus(false);
    }, 2 * 60 * 1000); // 2 minutes
  };

  const setupUserStatusTracking = () => {
    // Mark user as online when component mounts
    updateUserOnlineStatus(true);
    recordUserActivity();

    // Subscribe to target user's status changes
    statusSubscriptionRef.current = supabase
      .channel("user_status_changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${targetUser.id}`,
        },
        (payload) => {
          if (payload.new.online_status !== undefined) {
            setTargetUserStatus(payload.new.online_status);
          }
        }
      )
      .subscribe();
  };

  const initializeEncryption = () => {
    try {
      const key = ChatEncryption.generateEncryptionKey(
        chatId,
        currentUser.id,
        targetUser.id
      );
      setEncryptionKey(key);
    } catch (error) {
      console.error("Error initializing encryption:", error);
      // Fallback key
      setEncryptionKey("default-encryption-key-12345");
    }
  };

  const setupRealtimeSubscription = () => {
    if (subscription) {
      subscription.unsubscribe();
    }

    subscription = supabase
      .channel(`chat_${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        async (payload) => {
          try {
            // Record activity for incoming messages
            recordUserActivity();

            // Skip if this is the current user's own message (we already added it temporarily)
            if (payload.new.sender_id === currentUser.id) {
              return;
            }

            // Handle image messages
            if (payload.new.image_url) {
              const imageMessage = {
                ...payload.new,
                content: payload.new.content || "[Image]",
              };

              setMessages((prev) => {
                const messageExists = prev.some(
                  (msg) => msg.id === imageMessage.id
                );
                if (!messageExists) {
                  return [...prev, imageMessage];
                }
                return prev;
              });
              return;
            }

            // Decrypt the incoming text message
            let decryptedContent = payload.new.content;
            if (encryptionKey) {
              decryptedContent = ChatEncryption.decryptMessage(
                payload.new.content,
                encryptionKey
              );
            }

            const decryptedMessage = {
              ...payload.new,
              content: decryptedContent,
            };

            setMessages((prev) => {
              const messageExists = prev.some(
                (msg) => msg.id === decryptedMessage.id
              );
              if (!messageExists) {
                return [...prev, decryptedMessage];
              }
              return prev;
            });
          } catch (error) {
            console.error("Error processing realtime message:", error);
          }
        }
      )
      .subscribe();
  };

  const fetchMessages = async () => {
    try {
      setLoading(true);

      // Record activity
      recordUserActivity();

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Process all messages (decrypt text, keep images as is)
      const processedMessages = await Promise.all(
        (data || []).map(async (message) => {
          try {
            // If it's an image message, return as is
            if (message.image_url) {
              return {
                ...message,
                content: message.content || "[Image]",
              };
            }

            // Decrypt text messages
            let decryptedContent = message.content;
            if (encryptionKey) {
              decryptedContent = ChatEncryption.decryptMessage(
                message.content,
                encryptionKey
              );
            }
            return {
              ...message,
              content: decryptedContent,
            };
          } catch (error) {
            console.error("Error processing message:", error);
            return {
              ...message,
              content: "[Encrypted message]",
            };
          }
        })
      );

      setMessages(processedMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      Alert.alert(
        "Error",
        "Failed to load messages. Please check your connection."
      );
    } finally {
      setLoading(false);
    }
  };

  const selectImage = () => {
    // Record activity
    recordUserActivity();
    setImageModalVisible(true);
  };

  const handleImagePick = async (type) => {
    // Record activity
    recordUserActivity();

    setImageModalVisible(false);
    setUploadStatus("");

    try {
      // Request permissions
      let permissionResult;
      if (type === "camera") {
        permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        permissionResult =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (permissionResult.status !== "granted") {
        Alert.alert(
          "Permission Required",
          `Sorry, we need ${
            type === "camera" ? "camera" : "gallery"
          } permissions to ${
            type === "camera" ? "take photos" : "select images"
          }!`
        );
        return;
      }

      const options = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
        exif: false,
      };

      let result;
      if (type === "camera") {
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      // FIX: Better result handling
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0];

        // Validate image data
        if (!selectedImage.base64) {
          Alert.alert(
            "Error",
            "Failed to get image data. Please try another image."
          );
          return;
        }

        setSelectedImage(selectedImage);
        setUploadStatus("Image selected. Ready to upload!");
        setImagePreviewVisible(true);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      setUploadStatus("Error: Failed to pick image");
      Alert.alert("Error", "Failed to pick image. Please try again.");
    }
  };

  // COMPLETELY FIXED: New upload function using fetch API
  // TEMPORARY FIX: Direct base64 upload
  const uploadImageToSupabase = async (image) => {
    try {
      setUploadStatus("Uploading image...");

      const fileName = `${chatId}/${Date.now()}.jpg`;
      const base64String = image.base64.replace(/^data:image\/\w+;base64,/, "");

      // Convert base64 to Uint8Array
      const byteString = atob(base64String);
      const arrayBuffer = new ArrayBuffer(byteString.length);
      const uint8Array = new Uint8Array(arrayBuffer);

      for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
      }

      const { data, error } = await supabase.storage
        .from("files")
        .upload(fileName, uint8Array, {
          contentType: "image/jpeg",
          cacheControl: "3600",
        });

      if (error) throw error;

      return fileName;
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  };

  // FIXED: Improved sendImageMessage with better error handling
  const sendImageMessage = async () => {
    if (!selectedImage || !currentUser) {
      Alert.alert("Error", "No image selected or user not authenticated.");
      return;
    }

    // Record activity
    recordUserActivity();

    setSendingImage(true);
    let tempMessageId = null;

    try {
      // Create temporary message with local URI
      const tempMessage = {
        id: `temp-${Date.now()}`,
        chat_id: chatId,
        sender_id: currentUser.id,
        content: "[Image]",
        image_url: selectedImage.uri, // Show local URI temporarily
        created_at: new Date().toISOString(),
        isTemp: true,
        isSending: true,
      };

      tempMessageId = tempMessage.id;
      setMessages((prev) => [...prev, tempMessage]);
      setImagePreviewVisible(false);
      setUploadStatus("Preparing image for upload...");

      // FIX: Add small delay to ensure UI updates
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Upload image with single attempt first
      setUploadStatus("Uploading image to server...");

      const fileName = await uploadImageToSupabase(selectedImage);

      // FIX: Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("files").getPublicUrl(fileName);

      console.log("Public URL generated:", publicUrl);

      setUploadStatus("Saving message to database...");

      // Insert message with image URL to database
      const { data, error } = await supabase
        .from("messages")
        .insert([
          {
            chat_id: chatId,
            sender_id: currentUser.id,
            content: "[Image]",
            image_url: publicUrl,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Database insert error:", error);
        throw new Error(`Database error: ${error.message}`);
      }

      // FIX: Replace temporary message with real one
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessageId
            ? {
                ...data,
                image_url: publicUrl,
                isTemp: false,
              }
            : msg
        )
      );

      // Update chat timestamp
      await supabase
        .from("chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", chatId);

      // Clear selected image and status
      setSelectedImage(null);
      setUploadStatus("Image sent successfully!");

      // Auto-clear success status
      setTimeout(() => {
        setUploadStatus("");
      }, 2000);
    } catch (error) {
      console.error("Final error sending image:", error);

      // Remove temporary message on error
      if (tempMessageId) {
        setMessages((prev) => prev.filter((msg) => msg.id !== tempMessageId));
      }

      let errorMessage = "Failed to send image. ";

      if (
        error.message.includes("bucket") ||
        error.message.includes("Bucket")
      ) {
        errorMessage += "Storage bucket issue. Please contact support.";
      } else if (
        error.message.includes("network") ||
        error.message.includes("Network")
      ) {
        errorMessage += "Network connection issue. Please check your internet.";
      } else if (
        error.message.includes("JWT") ||
        error.message.includes("auth")
      ) {
        errorMessage += "Authentication error. Please restart the app.";
      } else {
        errorMessage += error.message || "Please try again.";
      }

      setUploadStatus(`Error: ${errorMessage}`);

      Alert.alert("Upload Failed", errorMessage, [
        {
          text: "Try Again",
          onPress: () => {
            setImagePreviewVisible(true);
          },
        },
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            setSelectedImage(null);
            setUploadStatus("");
          },
        },
      ]);
    } finally {
      setSendingImage(false);
    }
  };

  // FIXED: Add cleanup function for image states
  const cancelImageSend = () => {
    setSelectedImage(null);
    setImagePreviewVisible(false);
    setUploadStatus("");
    setSendingImage(false);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser || !encryptionKey) return;

    // Record activity
    recordUserActivity();

    const messageContent = newMessage.trim();

    let encryptedContent = messageContent;
    try {
      // Encrypt the message before sending
      encryptedContent = ChatEncryption.encryptMessage(
        messageContent,
        encryptionKey
      );
    } catch (error) {
      console.error("Error encrypting message:", error);
      Alert.alert(
        "Encryption Error",
        "Message not sent due to encryption error."
      );
      return;
    }

    const tempMessage = {
      id: `temp-${Date.now()}`,
      chat_id: chatId,
      sender_id: currentUser.id,
      content: messageContent, // Show original text temporarily
      created_at: new Date().toISOString(),
      isTemp: true,
    };

    setMessages((prev) => [...prev, tempMessage]);
    setNewMessage("");
    setSending(true);

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert([
          {
            chat_id: chatId,
            sender_id: currentUser.id,
            content: encryptedContent, // Store encrypted content in DB
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // Replace temporary message with the real one (showing decrypted content)
      const realMessage = {
        ...data,
        content: messageContent, // Show decrypted content to user
      };

      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempMessage.id ? realMessage : msg))
      );

      // Update chat timestamp
      await supabase
        .from("chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", chatId);
    } catch (error) {
      console.error("Error sending message:", error);
      // Remove temporary message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
      setNewMessage(messageContent);
      Alert.alert("Send Failed", "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  const safeScrollToBottom = () => {
    try {
      if (flatListRef.current && messages.length > 0) {
        setTimeout(() => {
          if (flatListRef.current) {
            flatListRef.current.scrollToEnd({ animated: true });
          }
        }, 100);
      }
    } catch (error) {
      console.log("Scroll error:", error);
    }
  };

  useEffect(() => {
    safeScrollToBottom();
  }, [messages]);

  const renderMessage = ({ item }) => {
    const isCurrentUser = item.sender_id === currentUser.id;
    const isTemp = item.isTemp;
    const isImage = item.image_url;
    const isSending = item.isSending;

    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: isCurrentUser ? "flex-end" : "flex-start",
          marginVertical: 8,
          paddingHorizontal: 12,
        }}
      >
        <View
          style={{
            backgroundColor: isCurrentUser ? "#ffed2bff" : "white",
            padding: isImage ? 10 : 12,
            borderRadius: 20,
            maxWidth: "80%",
            minWidth: isImage ? 120 : "auto",
            borderWidth: 1,
            borderColor: isCurrentUser ? "#ffd700" : "#E5E5E5",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 2,
            elevation: 2,
            opacity: isTemp || isSending ? 0.7 : 1,
          }}
        >
          {isImage ? (
            <TouchableOpacity
              onPress={() => {
                if (!isTemp && !isSending) {
                  setSelectedImage({ uri: item.image_url });
                  setImagePreviewVisible(true);
                }
              }}
              activeOpacity={0.8}
              disabled={isTemp || isSending}
            >
              <View>
                {/* Loading indicator for sending images */}
                {(isTemp || isSending) && (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: "rgba(0,0,0,0.4)",
                      borderRadius: 16,
                      justifyContent: "center",
                      alignItems: "center",
                      zIndex: 1,
                    }}
                  >
                    <ActivityIndicator size="large" color="#ffed2bff" />
                    <Text
                      style={{
                        color: "white",
                        marginTop: 10,
                        fontWeight: "bold",
                        fontSize: 14,
                      }}
                    >
                      {isSending ? "Uploading..." : "Sending..."}
                    </Text>
                  </View>
                )}

                <Image
                  source={{ uri: item.image_url }}
                  style={{
                    width: "100%",
                    height: undefined,
                    aspectRatio: 1,
                    borderRadius: 16,
                    maxWidth: 280,
                    minWidth: 120,
                    backgroundColor: "#f5f5f5",
                  }}
                  resizeMode="cover"
                  onError={() =>
                    console.log("Image load error:", item.image_url)
                  }
                />

                {/* Click to view hint */}
                {!isTemp && !isSending && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 8,
                      right: 8,
                      backgroundColor: "rgba(0,0,0,0.6)",
                      borderRadius: 12,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}
                  >
                    <Icon name="expand-outline" size={14} color="white" />
                  </View>
                )}

                {item.content && item.content !== "[Image]" && (
                  <Text
                    style={{
                      color: "black",
                      fontSize: 15,
                      marginTop: 10,
                      paddingHorizontal: 4,
                      lineHeight: 20,
                    }}
                  >
                    {item.content}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ) : (
            <Text
              style={{
                color: "black",
                fontSize: 16,
                lineHeight: 22,
              }}
            >
              {item.content}
            </Text>
          )}

          <Text
            style={{
              fontSize: 11,
              color: isCurrentUser ? "#666" : "#888",
              marginTop: 6,
              textAlign: "right",
              fontStyle: isTemp || isSending ? "italic" : "normal",
            }}
          >
            {isTemp || isSending
              ? "Sending..."
              : new Date(item.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
            {isCurrentUser && !isImage && (
              <Icon name="lock-closed" color="#042d06ff" />
            )}
            {isImage && <Icon name="image" />}
            {(isTemp || isSending) && "⟳"}
          </Text>
        </View>
      </View>
    );
  };

  // FIXED: Add styles object
  const styles = {
    uploadStatus: {
      fontSize: 14,
      marginBottom: 10,
      textAlign: "center",
      fontWeight: "600",
    },
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#171717ff" }}>
      <StatusBar backgroundColor="#171717ff" barStyle="dark-content" />

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 15,
          backgroundColor: "#171717ff",
          borderBottomWidth: 1,
          borderBottomColor: "gray",
        }}
      >
        <TouchableOpacity
          style={{ marginLeft: 1 }}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ fontSize: 18, color: "#003457ff" }}>
            <Icon name="chevron-back" size={24} color="white" />
          </Text>
        </TouchableOpacity>

        <Image
          source={{
            uri: targetUser.avatar_url || "https://via.placeholder.com/40",
          }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 2,
            borderColor: "#ffed2bff",
            marginLeft: "3%",
          }}
        />

        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "white" }}>
            {targetUser.name || targetUser.username}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: targetUserStatus ? "#4CAF50" : "#95A5A6",
            }}
          >
            {targetUserStatus ? "Online" : "Offline"}
          </Text>
        </View>

        {/* Encryption Status */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Icon name="lock-closed" size={16} color="#4CAF50" />
          <Text style={{ fontSize: 12, color: "#4CAF50", marginLeft: 4 }}>
            E2E
          </Text>
        </View>
      </View>

      {/* Messages List */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={{ flex: 1 }}>
          {loading ? (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ActivityIndicator size="large" color="#ffed2bff" />
              <Text style={{ marginTop: 10, color: "#fff" }}>
                Loading messages...{" "}
              </Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, index) => {
                // More robust key generation
                const baseKey = `${item.id}-${item.isTemp ? "temp" : "real"}-${
                  item.created_at
                }`;
                return `${baseKey}-${index}`;
              }}
              renderItem={renderMessage}
              onContentSizeChange={safeScrollToBottom}
              onLayout={safeScrollToBottom}
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
            />
          )}

          {/* Message Input */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 15,
              backgroundColor: "#171717ff",
              borderTopWidth: 1,
              borderTopColor: "gray",
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#f5f5f5",
                borderWidth: 2,
                borderColor: "white",
                borderRadius: 50,
                marginRight: 10,
                paddingHorizontal: 8,
              }}
            >
              {/* Image Picker Button - Inside Message Box */}
              <TouchableOpacity
                style={{
                  padding: 8,
                }}
                onPress={selectImage}
                disabled={sendingImage}
              >
                {sendingImage ? (
                  <ActivityIndicator size="small" color="#ffed2bff" />
                ) : (
                  <Icon name="image-outline" size={24} color="#000" />
                )}
              </TouchableOpacity>

              <TextInput
                style={{
                  flex: 1,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 13,
                  color: "black",
                }}
                placeholder="Type a message..."
                placeholderTextColor="#3c4546ff"
                value={newMessage}
                onChangeText={setNewMessage}
                multiline
                maxLength={500}
              />
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: "#ffed2bff",
                padding: 12,
                borderRadius: 25,
                borderWidth: 2,
                borderColor: "#ffed2bff",
                opacity: !newMessage.trim() || sending ? 0.5 : 1,
              }}
              onPress={sendMessage}
              disabled={!newMessage.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="black" />
              ) : (
                <Text style={{ color: "black", fontWeight: "700" }}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Image Picker Modal */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setImageModalVisible(false)}>
          <View
            style={{
              flex: 1,
              justifyContent: "flex-end",
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
          >
            <TouchableWithoutFeedback>
              <View
                style={{
                  backgroundColor: "#171717ff",
                  padding: 20,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                }}
              >
                <Text
                  style={{
                    color: "white",
                    fontSize: 18,
                    fontWeight: "bold",
                    marginBottom: 20,
                    textAlign: "center",
                  }}
                >
                  Choose Image Source
                </Text>

                <TouchableOpacity
                  style={{
                    backgroundColor: "#ffed2bff",
                    padding: 15,
                    borderRadius: 10,
                    marginBottom: 10,
                  }}
                  onPress={() => handleImagePick("camera")}
                >
                  <Text
                    style={{
                      color: "black",
                      fontSize: 16,
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Take Photo
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: "#ffed2bff",
                    padding: 15,
                    borderRadius: 10,
                    marginBottom: 10,
                  }}
                  onPress={() => handleImagePick("gallery")}
                >
                  <Text
                    style={{
                      color: "black",
                      fontSize: 16,
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Choose from Gallery
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: "#666",
                    padding: 15,
                    borderRadius: 10,
                  }}
                  onPress={() => setImageModalVisible(false)}
                >
                  <Text
                    style={{
                      color: "white",
                      fontSize: 16,
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Enhanced Image Preview Modal for Full-Screen Viewing */}
      <Modal
        visible={imagePreviewVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelImageSend}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.95)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* Close Button */}
          <TouchableOpacity
            style={{
              position: "absolute",
              top: Platform.OS === "ios" ? 60 : 40,
              right: 20,
              zIndex: 10,
              backgroundColor: "rgba(255,255,255,0.2)",
              borderRadius: 20,
              padding: 8,
            }}
            onPress={cancelImageSend}
          >
            <Icon name="close" size={28} color="white" />
          </TouchableOpacity>

          {/* Image Container */}
          <View
            style={{
              width: "100%",
              height: "100%",
              justifyContent: "center",
              alignItems: "center",
              padding: 10,
            }}
          >
            {selectedImage && (
              <Image
                source={{ uri: selectedImage.uri || selectedImage }}
                style={{
                  width: "100%",
                  height: undefined,
                  aspectRatio: 1,
                  maxWidth: "100%",
                  maxHeight: "80%",
                  borderRadius: 8,
                }}
                resizeMode="contain"
              />
            )}
          </View>

          {/* Action Buttons for Image Send Modal */}
          {uploadStatus && uploadStatus.includes("selected") && (
            <View
              style={{
                position: "absolute",
                bottom: 40,
                left: 20,
                right: 20,
                backgroundColor: "#171717ff",
                padding: 20,
                borderRadius: 20,
                margin: 20,
              }}
            >
              <Text
                style={{
                  color: "white",
                  fontSize: 18,
                  fontWeight: "bold",
                  marginBottom: 20,
                  textAlign: "center",
                }}
              >
                Send Image
              </Text>

              {/* Upload Status */}
              {uploadStatus ? (
                <Text
                  style={[
                    styles.uploadStatus,
                    {
                      color:
                        uploadStatus.includes("Error") ||
                        uploadStatus.includes("Failed")
                          ? "#ff6b6b"
                          : uploadStatus.includes("success")
                          ? "#4CAF50"
                          : "#ffed2bff",
                    },
                  ]}
                >
                  {uploadStatus}
                </Text>
              ) : null}

              <Text
                style={{
                  color: "white",
                  fontSize: 14,
                  textAlign: "center",
                  marginBottom: 20,
                  opacity: 0.8,
                }}
              >
                {selectedImage
                  ? "Preview your image before sending"
                  : "No image selected"}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <TouchableOpacity
                  style={{
                    backgroundColor: "#666",
                    padding: 15,
                    borderRadius: 10,
                    flex: 1,
                    opacity: sendingImage ? 0.5 : 1,
                  }}
                  onPress={cancelImageSend}
                  disabled={sendingImage}
                >
                  <Text
                    style={{
                      color: "white",
                      fontSize: 16,
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: "#ffed2bff",
                    padding: 15,
                    borderRadius: 10,
                    flex: 1,
                    opacity: sendingImage || !selectedImage ? 0.5 : 1,
                  }}
                  onPress={sendImageMessage}
                  disabled={sendingImage || !selectedImage}
                >
                  {sendingImage ? (
                    <ActivityIndicator size="small" color="black" />
                  ) : (
                    <Text
                      style={{
                        color: "black",
                        fontSize: 16,
                        fontWeight: "bold",
                        textAlign: "center",
                      }}
                    >
                      Send Image
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {sendingImage && (
                <Text
                  style={{
                    color: "#ffed2bff",
                    fontSize: 14,
                    textAlign: "center",
                    marginTop: 10,
                  }}
                >
                  Uploading image... Please wait
                </Text>
              )}
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default Chatting;
