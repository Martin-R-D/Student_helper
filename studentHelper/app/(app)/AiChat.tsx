import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, 
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, 
  Alert, Modal, FlatList, StatusBar 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config/api';
import { useSession } from '../../ctx';
import Markdown from 'react-native-markdown-display'

const TOP_PADDING = Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 0) + 10;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string; 
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  date: string;
}

export default function ExamTutorScreen() {
  const { session } = useSession();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const currentChat = Array.isArray(sessions) ? sessions.find(s => s.id === currentSessionId) : null;

  useEffect(() => {
    fetchChatHistory();
  }, []);

  const fetchChatHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/chat/history`, {
        headers: { 'Authorization': `Bearer ${session}` }
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setSessions(data);
      }
    } catch (e) {
      setSessions([]);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.4,
      base64: true,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
    }
  };

  const startNewChat = () => {
    setCurrentSessionId(null);
    setSelectedImage(null);
    setInputText('');
    setMessagesForNewChat();
  };

  const setMessagesForNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: `New Chat ${sessions.length + 1}`,
      date: new Date().toLocaleDateString(),
      messages: []
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setIsHistoryVisible(false);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() && !selectedImage) return;

    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      targetSessionId = Date.now().toString();
      const newSession: ChatSession = {
        id: targetSessionId,
        title: inputText.substring(0, 20) || "Image Analysis",
        date: new Date().toLocaleDateString(),
        messages: []
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(targetSessionId);
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      image: selectedImage?.uri
    };

    updateLocalMessages(targetSessionId, userMsg);
    const b64 = selectedImage?.base64;
    const textToSend = inputText;
    
    setInputText('');
    setSelectedImage(null);
    
    await sendToAI(targetSessionId, b64, textToSend);
  };

  const sendToAI = async (sessionId: string, imageB64?: string | null, text?: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/chat/message`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ session_id: sessionId, image: imageB64, message: text }),
      });

      const data = await response.json();
      if (response.ok) {
        const aiMsg: Message = { 
          id: data.id.toString(), 
          role: 'assistant', 
          content: data.reply 
        };
        updateLocalMessages(sessionId, aiMsg);
      }
    } catch (error) {
      Alert.alert("Error", "Server unreachable");
    } finally {
      setLoading(false);
    }
  };

  const updateLocalMessages = (sessionId: string, newMessage: Message) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, newMessage] } : s));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setIsHistoryVisible(true)}>
          <Ionicons name="menu-outline" size={30} color="#1e293b" />
        </TouchableOpacity>
        <TouchableOpacity onPress={startNewChat}>
          <Ionicons name="add-circle-outline" size={30} color="#2563eb" />
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20} style={{flex:1}}>
        <ScrollView ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })} contentContainerStyle={styles.chatList}>
          {!currentChat || currentChat.messages.length === 0 ? (
            <View style={styles.welcomeContainer}>
              <Ionicons name="chatbubbles-outline" size={80} color="#cbd5e1" />
              <Text style={styles.welcomeTitle}>New Conversation</Text>
              <Text style={styles.welcomeSub}>Send a message!</Text>
            </View>
          ) : (
            currentChat.messages.map((msg) => (
              <View key={msg.id} style={[styles.msgWrapper, msg.role === 'user' ? styles.userRow : styles.aiRow]}>
                <View style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                  {msg.image && <Image source={{ uri: msg.image }} style={styles.chatImage} />}
                  <Text style={[styles.msgText, msg.role === 'user' ? styles.userText : styles.aiText]}>
                    <Markdown>{msg.content}</Markdown>
                  </Text>
                </View>
              </View>
            ))
          )}
          {loading && <ActivityIndicator color="#2563eb" style={{ alignSelf: 'flex-start', marginLeft: 20, marginTop: 10 }} />}
        </ScrollView>

          {selectedImage && (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: selectedImage.uri }} style={styles.smallPreview} />
              <TouchableOpacity style={styles.removeImage} onPress={() => setSelectedImage(null)}>
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputContainer}>
            <TouchableOpacity onPress={handlePickImage} style={styles.attachBtn}>
              <Ionicons name="image-outline" size={28} color="#64748b" />
            </TouchableOpacity>
            <TextInput 
              style={styles.textInput} 
              placeholder="Type a message..." 
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity style={styles.sendIcon} onPress={handleSendMessage}>
              <Ionicons name="paper-plane" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
      </KeyboardAvoidingView>

      <Modal visible={isHistoryVisible} animationType="fade" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sidebar}>
            <Text style={styles.sidebarHeader}>History</Text>
            <FlatList
              data={sessions}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.historyCard, currentSessionId === item.id && styles.activeCard]} 
                  onPress={() => { setCurrentSessionId(item.id); setIsHistoryVisible(false); }}
                >
                  <Ionicons name="chatbox-ellipses-outline" size={20} color="#64748b" />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.historyDate}>{item.date}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeSidebar} onPress={() => setIsHistoryVisible(false)}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setIsHistoryVisible(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: TOP_PADDING },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 60, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  chatList: { padding: 15, paddingBottom: 30 },
  msgWrapper: { marginBottom: 15, width: '100%' },
  userRow: { alignItems: 'flex-end' },
  aiRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 18 },
  userBubble: { backgroundColor: '#2563eb' },
  aiBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 1 },
  msgText: { fontSize: 16, lineHeight: 22 },
  userText: { color: '#fff' },
  aiText: { color: '#334155' },
  chatImage: { width: 200, height: 150, borderRadius: 10, marginBottom: 8 },
  imagePreviewContainer: { padding: 10, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center' },
  smallPreview: { width: 60, height: 60, borderRadius: 8 },
  removeImage: { position: 'absolute', top: 5, left: 65 },
  inputContainer: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  attachBtn: { marginRight: 10 },
  textInput: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, fontSize: 16, maxHeight: 100 },
  sendIcon: { backgroundColor: '#2563eb', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  welcomeContainer: { alignItems: 'center', marginTop: 120, paddingHorizontal: 40 },
  welcomeTitle: { fontSize: 22, fontWeight: 'bold', color: '#1e293b', marginTop: 15 },
  welcomeSub: { textAlign: 'center', color: '#64748b', marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row' },
  sidebar: { width: '75%', backgroundColor: '#fff', padding: 25, paddingTop: 50 },
  sidebarHeader: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  historyCard: { flexDirection: 'row', padding: 12, borderRadius: 12, marginBottom: 5 },
  activeCard: { backgroundColor: '#eff6ff' },
  historyTitle: { fontWeight: '600', color: '#1e293b' },
  historyDate: { fontSize: 11, color: '#94a3b8' },
  closeSidebar: { marginTop: 'auto', alignSelf: 'center', padding: 15 },
  closeText: { color: '#64748b', fontWeight: 'bold' }
});