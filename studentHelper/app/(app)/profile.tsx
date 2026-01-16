import { useEffect, useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { useSession } from '../../ctx';
import { API_URL } from '../../config/api';

export default function Profile() {
  const { session, signOut } = useSession();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/auth/myInfo`, {
      headers: {
        Authorization: `Bearer ${session}`,
      },
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Server responded with status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => setEmail(data.email))
      .catch((err) => {
        console.log("Fetch error:", err);
      });
  }, [session]);

  const changePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in both password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      alert("Err");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/change_password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Update failed');

      Alert.alert('Success', 'Password updated successfully');
      alert("Password updated!");
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to change password');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <Text style={styles.label}>Email</Text>
      <Text style={styles.value}>{email}</Text>

      <TextInput
        placeholder="New password"
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        style={styles.input}
      />

      <TextInput
        placeholder="Confirm new password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        style={styles.input}
      />

      <TouchableOpacity style={styles.button} onPress={changePassword}>
        <Text style={styles.buttonText}>Change Password</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logout} onPress={signOut}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 30,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  value: {
    fontSize: 18,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#4f46e5',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  logout: {
    alignItems: 'center',
  },
  logoutText: {
    color: '#e11d48',
    fontWeight: 'bold',
  },
});