import { useState } from 'react';
import { View, TextInput, Button, Text, Alert } from 'react-native';
import { useSession } from '../ctx';
import { useRouter } from 'expo-router';

export default function SignIn() {
  const { signIn } = useSession();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = async () => {
    try {
      await signIn(email, password);
      Alert.alert('Success', 'Logged in!');
      router.replace('/home'); 
    } catch (err: any) {
      Alert.alert('Login Failed', err.message);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <Text style={{ marginBottom: 5 }}>Email:</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Enter your email"
        style={{ borderWidth: 1, padding: 8, marginBottom: 15 }}
      />

      <Text style={{ marginBottom: 5 }}>Password:</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Enter your password"
        style={{ borderWidth: 1, padding: 8, marginBottom: 20 }}
      />

      <Button title="Sign In" onPress={handleSignIn} />

      <Text style={{ marginTop: 15, textAlign: 'center' }}>
        Don't have an account?{' '}
        <Text
          style={{ color: 'blue' }}
          onPress={() => router.push('/register')} 
        >
          Register
        </Text>
      </Text>
    </View>
  );
}
