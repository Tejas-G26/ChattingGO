// services/authService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

// Storage keys
const SESSION_KEY = 'supabase_auth_session';
const USER_PROFILE_KEY = 'supabase_user_profile';

export const authService = {
  // Save complete session data
  async saveSession(session) {
    try {
      if (!session || !session.user) return false;
      
      const sessionData = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at || Date.now() + (3600 * 1000), // 1 hour default
        user: {
          id: session.user.id,
          email: session.user.email,
          user_metadata: session.user.user_metadata,
          app_metadata: session.user.app_metadata
        }
      };
      
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      return true;
    } catch (error) {
      console.error('Error saving session:', error);
      return false;
    }
  },

  // Get valid session with auto-refresh
  async getValidSession() {
    try {
      // First, try to get from AsyncStorage
      const sessionStr = await AsyncStorage.getItem(SESSION_KEY);
      
      if (!sessionStr) {
        // No stored session, check Supabase
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) return null;
        
        // Save this session for future
        await this.saveSession(session);
        return session;
      }
      
      const storedSession = JSON.parse(sessionStr);
      const now = Date.now();
      
      // Check if token is expired (with 5 minute buffer)
      if (storedSession.expires_at && storedSession.expires_at < (now - (5 * 60 * 1000))) {
        // Token expired or close to expiring, try to refresh
        try {
          const { data, error } = await supabase.auth.refreshSession({
            refresh_token: storedSession.refresh_token
          });
          
          if (error || !data.session) {
            // Refresh failed, clear and return null
            await this.clearSession();
            return null;
          }
          
          // Save refreshed session
          await this.saveSession(data.session);
          return data.session;
        } catch (refreshError) {
          console.error('Refresh error:', refreshError);
          await this.clearSession();
          return null;
        }
      }
      
      // Session is still valid, return it
      return storedSession;
    } catch (error) {
      console.error('Error getting session:', error);
      await this.clearSession();
      return null;
    }
  },

  // Save user profile data separately
  async saveUserProfile(profile) {
    try {
      if (!profile) return false;
      await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
      return true;
    } catch (error) {
      console.error('Error saving profile:', error);
      return false;
    }
  },

  // Get user profile
  async getUserProfile() {
    try {
      const profileStr = await AsyncStorage.getItem(USER_PROFILE_KEY);
      return profileStr ? JSON.parse(profileStr) : null;
    } catch (error) {
      console.error('Error getting profile:', error);
      return null;
    }
  },

  // Clear all auth data
  async clearSession() {
    try {
      await AsyncStorage.multiRemove([SESSION_KEY, USER_PROFILE_KEY]);
      // Don't call supabase.auth.signOut() here - let components handle it
      return true;
    } catch (error) {
      console.error('Error clearing session:', error);
      return false;
    }
  },

  // Check if user is authenticated
  async isAuthenticated() {
    const session = await this.getValidSession();
    return !!session;
  },

  // Get current user ID
  async getCurrentUserId() {
    const session = await this.getValidSession();
    return session?.user?.id || null;
  }
};