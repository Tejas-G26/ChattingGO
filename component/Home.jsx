import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { authService } from "../services/authService";
import { supabase } from "../supabase";

const { width, height } = Dimensions.get("window");

// AsyncStorage keys
const CHAT_USERS_STORAGE_KEY = "chatUsers";
const CURRENT_USER_STORAGE_KEY = "currentUser";
const AUTH_STORAGE_KEY = "authData";

// Add the same encryption class from Chatting.js
class ChatEncryption {
  static generateEncryptionKey(chatId, currentUserId, targetUserId) {
    const secret = `${chatId}-${currentUserId}-${targetUserId}`;
    let key = "";

    for (let i = 0; i < secret.length; i++) {
      key += secret.charCodeAt(i).toString(16).padStart(2, "0");
    }

    while (key.length < 32) {
      key += "0";
    }
    return key.substring(0, 32);
  }

  static encryptMessage(message, key) {
    if (!message || !key) return message;

    let encrypted = "";
    for (let i = 0; i < message.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const msgChar = message.charCodeAt(i);
      encrypted += String.fromCharCode(msgChar ^ keyChar);
    }

    return this.stringToBase64(encrypted);
  }

  static decryptMessage(encryptedBase64, key) {
    if (!encryptedBase64 || !key) return encryptedBase64;

    try {
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
        return encryptedBase64;
      }
    } catch (error) {
      console.error("Decryption error:", error);
      return "[Encrypted message]";
    }
  }

  static stringToBase64(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      return Buffer.from(str, "utf8").toString("base64");
    }
  }

  static base64ToString(base64) {
    try {
      return decodeURIComponent(escape(atob(base64)));
    } catch (e) {
      return Buffer.from(base64, "base64").toString("utf8");
    }
  }

  static isBase64(str) {
    try {
      return btoa(atob(str)) === str;
    } catch (err) {
      return false;
    }
  }
}

export const Home = ({ navigation, route }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [chatUsers, setChatUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState("chats");
  const appState = useRef(AppState.currentState);
  const subscriptions = useRef([]);

  useFocusEffect(
    React.useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          return true;
        }
      );

      return () => {
        subscription.remove();
      };
    }, [])
  );

  // Load auth data on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Check if user is authenticated
  // Check if user is authenticated
 const checkAuthStatus = async () => {
  try {
    // Use our auth service to check for valid session
    const session = await authService.getValidSession();
    
    if (!session || !session.user) {
      console.log("No valid session found, redirecting to login");
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" }],
      });
      return;
    }

    // If we have a valid session, proceed to fetch user data
    await fetchCurrentUser();
  } catch (error) {
    console.error("Auth check error:", error);
    navigation.reset({
      index: 0,
      routes: [{ name: "Login" }],
    });
  }
};

  

  // Clear auth data when user logs out
  const clearAuthData = async () => {
  try {
    await authService.clearSession();
    await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    await AsyncStorage.removeItem(CHAT_USERS_STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing auth data:", error);
  }
};

  // Load chat users from AsyncStorage
  useEffect(() => {
    if (currentUser) {
      loadChatUsersFromStorage();
    }
  }, [currentUser]);

  // Refresh when coming back from chat screen
  useEffect(() => {
    if (route.params?.refresh) {
      fetchChatUsers();
    }
  }, [route.params?.refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription.remove();
      cleanupSubscriptions();
      if (currentUser) {
        updateUserOnlineStatus(false);
      }
    };
  }, [currentUser]);

  const handleAppStateChange = async (nextAppState) => {
  if (
    appState.current.match(/inactive|background/) &&
    nextAppState === "active"
  ) {
    // Check session validity when app comes to foreground
    const isValid = await authService.isAuthenticated();
    if (!isValid) {
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" }],
      });
      return;
    }
    
    await updateUserOnlineStatus(true);
    fetchChatUsers();
  } else if (nextAppState.match(/inactive|background/)) {
    await updateUserOnlineStatus(false);
  }
  appState.current = nextAppState;
};

  useEffect(() => {
    if (currentUser) {
      fetchChatUsers();
      setupRealtimeSubscriptions();
    }

    return () => {
      cleanupSubscriptions();
    };
  }, [currentUser]);

  const loadChatUsersFromStorage = async () => {
    try {
      const storedChatUsers = await AsyncStorage.getItem(
        CHAT_USERS_STORAGE_KEY
      );
      if (storedChatUsers) {
        const parsedChatUsers = JSON.parse(storedChatUsers);
        setChatUsers(parsedChatUsers);
      }
    } catch (error) {
      console.error("Error loading chat users from storage:", error);
    }
  };

  const saveChatUsersToStorage = async (users) => {
    try {
      await AsyncStorage.setItem(CHAT_USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (error) {
      console.error("Error saving chat users to storage:", error);
    }
  };

  const saveCurrentUserToStorage = async (user) => {
    try {
      await AsyncStorage.setItem(
        CURRENT_USER_STORAGE_KEY,
        JSON.stringify(user)
      );
    } catch (error) {
      console.error("Error saving current user to storage:", error);
    }
  };

  const loadCurrentUserFromStorage = async () => {
    try {
      const storedUser = await AsyncStorage.getItem(CURRENT_USER_STORAGE_KEY);
      if (storedUser) {
        return JSON.parse(storedUser);
      }
    } catch (error) {
      console.error("Error loading current user from storage:", error);
    }
    return null;
  };

  const fetchCurrentUser = async () => {
  try {
    // Fetch fresh data from Supabase
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error("User fetch error:", userError);
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" }],
      });
      return;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Profile fetch error:", error);
      navigation.reset({
        index: 0,
        routes: [{ name: "ProfileImformation" }],
      });
      return;
    }

    if (profile) {
      const completeUser = { ...user, ...profile };
      setCurrentUser(completeUser);
      await saveCurrentUserToStorage(completeUser);
      await updateUserOnlineStatus(true);
      
      // Save profile to auth service too
      await authService.saveUserProfile(profile);

      // Check if profile is complete
      if (!profile?.name || !profile?.username) {
        navigation.reset({
          index: 0,
          routes: [{ name: "ProfileImformation" }],
        });
        return;
      }
    }
  } catch (error) {
    console.error("Error fetching user:", error);
    navigation.reset({
      index: 0,
      routes: [{ name: "Login" }],
    });
  }
};

  const updateUserOnlineStatus = async (isOnline) => {
    if (!currentUser) return;

    try {
      await supabase
        .from("profiles")
        .update({
          online_status: isOnline,
          last_seen: new Date().toISOString(),
        })
        .eq("id", currentUser.id);
    } catch (error) {
      console.error("Error updating online status:", error);
    }
  };

  const setupRealtimeSubscriptions = () => {
    if (!currentUser) return;

    cleanupSubscriptions();

    // Subscribe to profile updates
    const profileSubscription = supabase
      .channel("profile-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          updateUserOnlineStatusInList(payload.new);
        }
      )
      .subscribe();

    // Subscribe to new messages
    const messageSubscription = supabase
      .channel("new-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        async (payload) => {
          await handleNewMessage(payload.new);
        }
      )
      .subscribe();

    subscriptions.current = [profileSubscription, messageSubscription];
  };

  const cleanupSubscriptions = () => {
    subscriptions.current.forEach((sub) => {
      sub.unsubscribe();
    });
    subscriptions.current = [];
  };

  const updateUserOnlineStatusInList = (updatedProfile) => {
    setChatUsers((prevChats) => {
      const updatedChats = prevChats.map((chat) =>
        chat.id === updatedProfile.id
          ? {
              ...chat,
              online_status: updatedProfile.online_status,
              last_seen: updatedProfile.last_seen,
            }
          : chat
      );
      saveChatUsersToStorage(updatedChats);
      return updatedChats;
    });

    setSearchResults((prevResults) =>
      prevResults.map((user) =>
        user.id === updatedProfile.id
          ? {
              ...user,
              online_status: updatedProfile.online_status,
              last_seen: updatedProfile.last_seen,
            }
          : user
      )
    );
  };

  // Decrypt message for display in chat list
  const decryptMessageForDisplay = (encryptedContent, chatId, senderId) => {
    if (!encryptedContent) return "Start chatting...";

    try {
      // Check if the message is encrypted (base64)
      if (!ChatEncryption.isBase64(encryptedContent)) {
        return encryptedContent; // Return as is if not encrypted
      }

      const encryptionKey = ChatEncryption.generateEncryptionKey(
        chatId,
        currentUser.id,
        senderId
      );

      const decrypted = ChatEncryption.decryptMessage(
        encryptedContent,
        encryptionKey
      );
      return decrypted || "[Encrypted message]";
    } catch (error) {
      console.error("Error decrypting message for display:", error);
      return "[Encrypted message]";
    }
  };

  const handleNewMessage = async (newMessage) => {
    const existingChat = chatUsers.find(
      (chat) => chat.chat_id === newMessage.chat_id
    );

    if (existingChat) {
      // Decrypt the new message for display
      const decryptedContent = decryptMessageForDisplay(
        newMessage.content,
        newMessage.chat_id,
        newMessage.sender_id
      );

      setChatUsers((prevChats) => {
        const updatedChats = prevChats.filter(
          (chat) => chat.chat_id !== newMessage.chat_id
        );

        const updatedChat = {
          ...existingChat,
          lastMessage: decryptedContent,
          timestamp: newMessage.created_at,
          unreadCount: (existingChat.unreadCount || 0) + 1,
          isNewMessage: true, // Flag for green text
        };

        const newChats = [updatedChat, ...updatedChats];
        saveChatUsersToStorage(newChats);
        return newChats;
      });

      // Remove the green text after 3 seconds
      setTimeout(() => {
        setChatUsers((prevChats) => {
          const updatedChats = prevChats.map((chat) =>
            chat.chat_id === newMessage.chat_id
              ? { ...chat, isNewMessage: false }
              : chat
          );
          saveChatUsersToStorage(updatedChats);
          return updatedChats;
        });
      }, 3000);
    } else {
      // New chat - fetch sender profile and add to chats
      try {
        const { data: senderProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", newMessage.sender_id)
          .single();

        if (senderProfile) {
          const { data: chatData } = await supabase
            .from("chats")
            .select("*")
            .eq("id", newMessage.chat_id)
            .single();

          if (chatData) {
            const decryptedContent = decryptMessageForDisplay(
              newMessage.content,
              newMessage.chat_id,
              newMessage.sender_id
            );

            const newChatUser = {
              ...senderProfile,
              chat_id: newMessage.chat_id,
              lastMessage: decryptedContent,
              timestamp: newMessage.created_at,
              unreadCount: 1,
              isOnline: senderProfile.online_status || false,
              isNewMessage: true, // Flag for green text
            };

            setChatUsers((prev) => {
              const newChats = [newChatUser, ...prev];
              saveChatUsersToStorage(newChats);
              return newChats;
            });

            // Remove the green text after 3 seconds
            setTimeout(() => {
              setChatUsers((prevChats) => {
                const updatedChats = prevChats.map((chat) =>
                  chat.chat_id === newMessage.chat_id
                    ? { ...chat, isNewMessage: false }
                    : chat
                );
                saveChatUsersToStorage(updatedChats);
                return updatedChats;
              });
            }, 3000);
          }
        }
      } catch (error) {
        console.error("Error handling new message:", error);
      }
    }
  };

  const fetchChatUsers = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);

      const { data: chats, error: chatsError } = await supabase
        .from("chats")
        .select(
          `
          *,
          participant1:profiles!chats_participant1_fkey(*),
          participant2:profiles!chats_participant2_fkey(*)
        `
        )
        .or(
          `participant1_fkey.eq.${currentUser.id},participant2_fkey.eq.${currentUser.id}`
        )
        .order("updated_at", { ascending: false });

      if (chatsError) throw chatsError;

      const chatUsersWithDetails = await Promise.all(
        chats.map(async (chat) => {
          const otherUser =
            chat.participant1_fkey === currentUser.id
              ? chat.participant2
              : chat.participant1;

          // Get last message
          const { data: lastMessage } = await supabase
            .from("messages")
            .select("*")
            .eq("chat_id", chat.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          // Get unread message count
          const { count: unreadCount } = await supabase
            .from("messages")
            .select("*", { count: "exact" })
            .eq("chat_id", chat.id)
            .eq("sender_id", otherUser.id)
            .is("read", false);

          // Decrypt the last message for display
          let displayMessage = "Start chatting...";
          if (lastMessage?.content) {
            displayMessage = decryptMessageForDisplay(
              lastMessage.content,
              chat.id,
              lastMessage.sender_id
            );
          }

          return {
            ...otherUser,
            chat_id: chat.id,
            lastMessage: displayMessage,
            timestamp: lastMessage?.created_at || chat.updated_at,
            unreadCount: unreadCount || 0,
            isOnline: otherUser.online_status || false,
            last_seen: otherUser.last_seen,
            isNewMessage: false,
          };
        })
      );

      const sortedChatUsers = chatUsersWithDetails.sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );

      setChatUsers(sortedChatUsers);
      saveChatUsersToStorage(sortedChatUsers);
    } catch (error) {
      console.error("Error fetching chat users:", error);
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    if (!currentUser) return;

    try {
      setSearching(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
        .neq("id", currentUser.id)
        .limit(20);

      if (error) throw error;

      const usersWithStatus = data.map((user) => ({
        ...user,
        online_status: user.online_status || false,
        isOnline: user.online_status || false,
      }));

      setSearchResults(usersWithStatus || []);
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchChange = (text) => {
    setSearchQuery(text);
    if (text.trim()) {
      searchUsers(text);
    } else {
      setSearchResults([]);
    }
  };

  const startChat = async (user) => {
    if (!currentUser) return;

    try {
      // Check if chat already exists
      const { data: existingChat, error: chatError } = await supabase
        .from("chats")
        .select("*")
        .or(
          `and(participant1_fkey.eq.${currentUser.id},participant2_fkey.eq.${user.id}),and(participant1_fkey.eq.${user.id},participant2_fkey.eq.${currentUser.id})`
        )
        .single();

      let chatId;

      if (existingChat) {
        chatId = existingChat.id;
        await supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", chatId);

        await supabase
          .from("messages")
          .update({ read: true })
          .eq("chat_id", chatId)
          .eq("sender_id", user.id)
          .is("read", false);

        // Clear the new message flag when opening chat
        setChatUsers((prev) => {
          const updatedChats = prev.map((chat) =>
            chat.chat_id === chatId
              ? { ...chat, isNewMessage: false, unreadCount: 0 }
              : chat
          );
          saveChatUsersToStorage(updatedChats);
          return updatedChats;
        });
      } else {
        const { data: newChat, error: newChatError } = await supabase
          .from("chats")
          .insert([
            {
              participant1_fkey: currentUser.id,
              participant2_fkey: user.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        if (newChatError) throw newChatError;
        chatId = newChat.id;
      }

      setChatUsers((prev) => {
        const filtered = prev.filter((chatUser) => chatUser.id !== user.id);
        const updatedUser = {
          ...user,
          chat_id: chatId,
          lastMessage: "Start chatting...",
          timestamp: new Date().toISOString(),
          unreadCount: 0,
          isOnline: user.online_status || false,
          isNewMessage: false,
        };
        const newChats = [updatedUser, ...filtered];
        saveChatUsersToStorage(newChats);
        return newChats;
      });

      navigation.navigate("Chatting", {
        targetUser: user,
        currentUser: currentUser,
        chatId: chatId,
        onGoBack: () => fetchChatUsers(),
      });
    } catch (error) {
      console.error("Error starting chat:", error);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now - date;
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMins < 1) {
      return "Just now";
    } else if (diffInMins < 60) {
      return `${diffInMins}m`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h`;
    } else if (diffInDays < 7) {
      return `${diffInDays}d`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderChatItem = ({ item }) => (
    <TouchableOpacity style={styles.chatItem} onPress={() => startChat(item)}>
      <View style={styles.profileContainer}>
        <Image
          source={{
            uri: item.avatar_url || "https://via.placeholder.com/50",
          }}
          style={styles.profileImage}
        />
        {item.online_status && <View style={styles.onlineIndicator} />}
      </View>

      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text style={styles.userName}>
            {item.name || item.username}
            {item.isNewMessage && (
              <Text style={styles.newMessageIndicator}> ●</Text>
            )}
          </Text>
          <Text style={styles.timestamp}>{formatTime(item.timestamp)}</Text>
        </View>

        <View style={styles.chatFooter}>
          <Text
            style={[
              styles.lastMessage,
              item.unreadCount > 0 && styles.unreadMessage,
              item.isNewMessage && styles.newMessageText,
            ]}
            numberOfLines={1}
          >
            {item.lastMessage}
          </Text>

          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderSearchItem = ({ item }) => (
    <TouchableOpacity style={styles.searchItem} onPress={() => startChat(item)}>
      <View style={styles.profileContainer}>
        <Image
          source={{
            uri: item.avatar_url || "https://via.placeholder.com/50",
          }}
          style={styles.profileImage}
        />
        {item.online_status && <View style={styles.onlineIndicator} />}
      </View>

      <View style={styles.searchContent}>
        <Text style={styles.userName}>{item.name || item.username}</Text>
        <Text style={styles.username}>@{item.username}</Text>
      </View>

      <View style={styles.statusContainer}>
        <Text
          style={[
            styles.statusText,
            { color: item.online_status ? "#4CAF50" : "#95A5A6" },
          ]}
        >
          {item.online_status ? "Online" : "Offline"}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="dark-content" />

      <View style={styles.mainContent}>
        {/* Header and Search */}
        <View style={styles.header}>
          <Text style={styles.appTitle}>
            Chatting<Text style={styles.appTitleGO}>GO</Text>
          </Text>
          <View style={styles.searchContainer}>
            <Icon
              name="search-outline"
              size={20}
              color="#404546ff"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search users by name or username..."
              placeholderTextColor="#6c7475ff"
              value={searchQuery}
              onChangeText={handleSearchChange}
              onFocus={() => setActiveTab("search")}
            />
            {searching && (
              <ActivityIndicator
                size="small"
                color="#ffed2bff"
                style={styles.searchLoader}
              />
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "chats" && styles.activeTab]}
            onPress={() => {
              setActiveTab("chats");
              setSearchQuery("");
              setSearchResults([]);
            }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "chats" && styles.activeTabText,
              ]}
            >
              Chats
            </Text>
            {chatUsers.length > 0 && (
              <View style={styles.chatCountBadge}>
                <Text style={styles.chatCountText}>{chatUsers.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === "search" && styles.activeTab]}
            onPress={() => setActiveTab("search")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "search" && styles.activeTabText,
              ]}
            >
              Search
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === "chats" ? (
            <>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#ffed2bff" />
                  <Text style={styles.loadingText}>Loading chats... </Text>
                </View>
              ) : chatUsers.length > 0 ? (
                <FlatList
                  data={chatUsers}
                  keyExtractor={(item) => `${item.id}-${item.chat_id}`}
                  renderItem={renderChatItem}
                  showsVerticalScrollIndicator={false}
                  refreshing={loading}
                  onRefresh={fetchChatUsers}
                />
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    No chats yet {"\n"}
                    Search for users to start chatting!
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>
                {searchQuery ? "Search Results" : "Find Users"}
              </Text>

              {searching ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#ffed2bff" />
                  <Text style={styles.loadingText}>Searching users...</Text>
                </View>
              ) : searchQuery ? (
                searchResults.length > 0 ? (
                  <FlatList
                    data={searchResults}
                    keyExtractor={(item) => item.id}
                    renderItem={renderSearchItem}
                    showsVerticalScrollIndicator={false}
                  />
                ) : (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No users found</Text>
                  </View>
                )
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    Search for users by name or username
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Bottom Navigation */}
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => navigation.navigate("Home")}
          >
            <Text style={styles.navTextActive}>
              <Icon name="home-outline" size={40} color="yellow" />
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => navigation.navigate("Profile")}
          >
            <Text style={styles.navText}>
              <Icon name="person-circle-outline" size={40} color="white" />
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#171717ff",
  },
  mainContent: {
    flex: 1,
  },
  header: {
    paddingHorizontal: width * 0.05,
    paddingVertical: height * 0.02,
    borderBottomWidth: 1,
    borderBottomColor: "#666",
  },
  appTitle: {
    fontWeight: "800",
    fontSize: width * 0.07,
    color: "white",
    textAlign: "center",
    marginRight: "51%",
    marginBottom: 10,
  },
  appTitleGO: {
    color: "#ffed2bff",
    fontSize: width * 0.08,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "black",
    paddingHorizontal: 15,
  },
  searchInput: {
    flex: 1,
    height: height * 0.06,
    fontSize: width * 0.04,
    color: "black",
  },
  searchLoader: {
    marginLeft: 10,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "white",
    marginHorizontal: width * 0.05,
    marginTop: height * 0.01,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "black",
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: height * 0.015,
    position: "relative",
  },
  activeTab: {
    backgroundColor: "#ffed2bff",
  },
  tabText: {
    fontSize: width * 0.04,
    fontWeight: "600",
    color: "#666",
  },
  activeTabText: {
    color: "black",
    fontWeight: "700",
  },
  chatCountBadge: {
    backgroundColor: "#4CAF50",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 5,
    minWidth: 20,
  },
  chatCountText: {
    color: "white",
    fontSize: width * 0.03,
    fontWeight: "700",
    textAlign: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: width * 0.03,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: width * 0.045,
    fontWeight: "700",
    color: "white",
    marginLeft: width * 0.02,
    marginBottom: height * 0.01,
    marginTop: height * 0.01,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: height * 0.02,
    fontSize: width * 0.04,
    color: "#fff",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: width * 0.04,
    color: "white",
    textAlign: "center",
    lineHeight: height * 0.03,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: width * 0.03,
    backgroundColor: "white",
    marginHorizontal: width * 0.02,
    marginVertical: height * 0.005,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "black",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  profileContainer: {
    position: "relative",
    marginRight: width * 0.03,
  },
  profileImage: {
    width: width * 0.12,
    height: width * 0.12,
    borderRadius: width * 0.06,
    borderWidth: 2,
    borderColor: "#ffed2bff",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: width * 0.03,
    height: width * 0.03,
    borderRadius: width * 0.015,
    backgroundColor: "#4CAF50",
    borderWidth: 2,
    borderColor: "white",
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: height * 0.005,
  },
  userName: {
    fontSize: width * 0.04,
    fontWeight: "700",
    color: "black",
    flex: 1,
  },
  newMessageIndicator: {
    color: "#4CAF50",
    fontSize: width * 0.05,
  },
  timestamp: {
    fontSize: width * 0.03,
    color: "#95A5A6",
  },
  chatFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastMessage: {
    fontSize: width * 0.035,
    color: "#666",
    flex: 1,
    marginRight: width * 0.02,
  },
  unreadMessage: {
    color: "black",
    fontWeight: "600",
  },
  newMessageText: {
    color: "#4CAF50",
    fontWeight: "700",
  },
  unreadBadge: {
    backgroundColor: "#4CAF50",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadCount: {
    color: "white",
    fontSize: width * 0.03,
    fontWeight: "700",
    textAlign: "center",
  },
  searchItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: width * 0.04,
    backgroundColor: "white",
    marginHorizontal: width * 0.02,
    marginVertical: height * 0.005,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "black",
  },
  searchContent: {
    flex: 1,
    marginLeft: width * 0.03,
  },
  username: {
    fontSize: width * 0.035,
    color: "#666",
    marginTop: height * 0.005,
  },
  statusContainer: {
    alignItems: "flex-end",
  },
  statusText: {
    fontSize: width * 0.03,
    fontWeight: "600",
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#171717ff",
    borderTopWidth: 1,
    borderTopColor: "gray",
    paddingVertical: height * 0.01,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: height * 0.01,
  },
  navText: {
    fontSize: width * 0.04,
    fontWeight: "600",
    color: "#003457ff",
  },
  navTextActive: {
    fontSize: width * 0.04,
    fontWeight: "700",
    color: "#ffed2bff",
  },
});

export default Home;
