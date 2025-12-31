import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator, Alert, Platform, StatusBar} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../../config/api';
import { useSession } from '../../../ctx';

const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 0;

export default function ExamScannerScreen() {
  const { session } = useSession();
  const [image, setImage] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow gallery access to scan your test.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      setBase64(result.assets[0].base64 || null);
      setAnalysis(null);
    }
  };

  const analyzeTest = async () => {
    if (!base64 || !session) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/chat/examAnalyse`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          image: base64 
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setAnalysis(data.reply);
      }
    } catch (error) {
      Alert.alert("Error", "Could not connect to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Exam Analyzer</Text>
        <Text style={styles.subtitle}>Scan your test to find mistakes.</Text>

        <TouchableOpacity 
          style={[styles.uploadBox, image && styles.uploadBoxActive]} 
          onPress={pickImage}
        >
          {image ? (
            <Image source={{ uri: image }} style={styles.previewImage} />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="camera-outline" size={50} color="#94a3b8" />
              <Text style={styles.placeholderText}>Select Test Image</Text>
            </View>
          )}
        </TouchableOpacity>

        {image && !loading && (
          <TouchableOpacity style={styles.analyzeButton} onPress={analyzeTest}>
            <Ionicons name="sparkles" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Start Analysis</Text>
          </TouchableOpacity>
        )}

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Analyzing...</Text>
          </View>
        )}

        {analysis && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>AI Feedback</Text>
            <Text style={styles.analysisText}>{analysis}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8fafc',
    paddingTop: STATUS_BAR_HEIGHT 
  },
  scrollContainer: { 
    padding: 20, 
    alignItems: 'center',
    paddingBottom: 40 
  },
  title: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: '#1e293b', 
    marginBottom: 8 
  },
  subtitle: { 
    fontSize: 16, 
    color: '#64748b', 
    textAlign: 'center', 
    marginBottom: 30 
  },
  uploadBox: {
    width: '100%',
    height: 320,
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
  },
  uploadBoxActive: { 
    borderStyle: 'solid', 
    borderColor: '#2563eb' 
  },
  previewImage: { 
    width: '100%', 
    height: '100%',
    resizeMode: 'cover'
  },
  placeholder: { 
    alignItems: 'center' 
  },
  placeholderText: { 
    color: '#94a3b8', 
    marginTop: 10, 
    fontSize: 16,
    fontWeight: '500'
  },
  analyzeButton: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  loadingBox: { 
    marginTop: 20, 
    alignItems: 'center' 
  },
  loadingText: { 
    color: '#2563eb', 
    marginTop: 10, 
    fontWeight: '600' 
  },
  resultCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginTop: 30,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  resultTitle: { 
    color: '#1e293b', 
    fontSize: 20, 
    fontWeight: 'bold', 
    marginBottom: 10 
  },
  analysisText: { 
    color: '#475569', 
    fontSize: 16, 
    lineHeight: 24 
  }
});