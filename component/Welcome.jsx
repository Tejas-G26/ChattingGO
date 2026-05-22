import { Image, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export const Welcome = ({ navigation }) => {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000"}}>

      {/* Gradient Background */}
      

        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 20
        }}>

          {/* Hero Image */}
          <Image
            style={{
              width:'90%',
              height: '40%',
              marginTop: '5%',
              resizeMode: 'contain',
              
            }}
            source={require('../assets/images/WelcomeImage.png')}
          />

          {/* App Title */}
          <Text
            style={{
              fontSize: 50,
              fontWeight: '900',
              color: '#fff',
              marginTop: '6%',
              textAlign: 'center',
            }}
          >
            Chatting
            <Text style={{ color: '#ffed2bff', fontSize: 55 }}>Go</Text>
          </Text>

          {/* Subtitle */}
          <Text
            style={{
              color: '#fff',
              fontSize: 14,
              marginTop: '3%',
              textAlign: 'center',
              opacity: 0.8,
            }}
          >
            Stay close, wherever you are
          </Text>

          {/* Button */}
          <TouchableOpacity
            style={{
              backgroundColor: '#ffed2bff',
              width: '70%',
              height: '9%',
              borderRadius: 50,
              borderWidth:1,
              borderColor:'black',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: '17%',
              elevation: 8,
              shadowColor: '#FFC107',
              shadowOpacity: 0.4,
              shadowRadius: 10,
            }}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={{ fontSize: 30, fontWeight: '900', color: '#000' }}>
              Let’s Go
            </Text>
          </TouchableOpacity>


          {/* Bottom Note */}
          <Text
            style={{
              color: '#fff',
              fontSize: 16,
              marginTop: '20%',
              opacity: 0.6,
            }}
          >end-to-end encryption  </Text>

        </View>

      

    </SafeAreaView>
    
  );
};

export default Welcome;
