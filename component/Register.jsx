import { useState } from 'react';
import { ActivityIndicator, Dimensions, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '../services/authService';
import { supabase } from '../supabase';

const { width, height } = Dimensions.get('window');

export const Register = ({ navigation }) => {

  const [Email, setEmail] = useState('');
  const [Password, setPassword] = useState('');
  const [Message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

   const Register_Supabase = async () => {
    if (!Email.trim() || !Password.trim()) {
      setMessage("Enter email and password");
      return;
    }

    if (Password.length < 6) {
      setMessage("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: Email.trim(),
        password: Password
      });

      if (error) {
        setMessage('Registration Error: ' + error.message);
        setLoading(false);
        return;
      }

      if (data.user && data.session) {
        // Save the session if auto-confirmed
        await authService.saveSession(data.session);
        setMessage('Registration successful! Please check your email to verify your account.');
        
        // Only auto-redirect if email confirmation is not required
        // Wait a moment then redirect to profile setup
        setTimeout(() => {
          navigation.navigate("ProfileImformation");
        }, 2000);
      } else if (data.user) {
        // User created but needs email verification
        setMessage('Registration successful! Please check your email to verify your account.');
        setTimeout(() => {
          navigation.navigate("Login");
        }, 3000);
      }
    } catch (error) {
      setMessage('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#171717ff" }}>
      <View style={{
        flex: 1,
        paddingHorizontal: width * 0.06,
        justifyContent: 'center',
        alignItems: 'center'
      }}>

        <Text style={{
          fontSize: width * 0.1,
          fontWeight: '800',
          color: 'white',
          marginBottom: height * 0.01
        }}>
            Create Account
        </Text>

        <Text style={{
          fontSize: width * 0.045,
          color: '#ffed2bff',
          marginBottom: height * 0.04
        }}>
            Let's get you started!
        </Text>

        {/* Message */}
        <Text style={{ 
          color: Message.includes('successful') ? 'green' : 'red', 
          fontSize: width * 0.035, 
          marginBottom: height * 0.02,
          textAlign: 'center'
        }}>
          {Message}
        </Text>

        {/* Email */}
        <TextInput
          placeholder='Email'
          placeholderTextColor="#95A5A6"
          value={Email}
          onChangeText={setEmail}
          style={{
            width: '100%',
            height: height * 0.07,
            backgroundColor: 'white',
            borderRadius: 20,
            paddingLeft: width * 0.04,
            fontSize: width * 0.04,
            borderWidth: 1,
            borderColor: 'white',
            marginBottom: height * 0.02,
          }}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        {/* Password */}
        <TextInput
          placeholder='Password (min. 6 characters)'
          placeholderTextColor="#95A5A6"
          secureTextEntry={true}
          value={Password}
          onChangeText={setPassword}
          style={{
            width: '100%',
            height: height * 0.07,
            backgroundColor: 'white',
            borderRadius: 20,
            paddingLeft: width * 0.04,
            paddingRight: width * 0.04,
            fontSize: width * 0.04,
            borderWidth: 1,
            borderColor: 'white',
            marginBottom: height * 0.02,
          }}
        />

        {/* Register Button */}
        <TouchableOpacity
          style={{
            backgroundColor: '#ffed2bff',
            width: '100%',
            height: height * 0.07,
            borderRadius: 50,
            borderWidth: 1,
            borderColor: 'black',
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: height * 0.02,
          }}
          onPress={Register_Supabase}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="large" color="black" />
          ) : (
            <Text style={{ fontSize: width * 0.05, fontWeight: '700', color: 'black' }}>
              Register
            </Text>
          )}
        </TouchableOpacity>

        {/* Already have account */}
        <View style={{ flexDirection: 'row', marginTop: height * 0.03 }}>
          <Text style={{ color: 'white', fontSize: width * 0.04 }}>
            Already have an account?
          </Text>

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={{ 
              fontSize: width * 0.04, 
              color: "#ffed2bff", 
              marginLeft: width * 0.02, 
              fontWeight: '600' 
            }}>
              Login
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
};

export default Register;