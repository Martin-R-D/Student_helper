import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  Platform, StatusBar, ActivityIndicator 
} from 'react-native';
import { useSession } from '../../ctx';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../config/api';
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router'; 

const TOP_PADDING = Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 0) + 10;

export default function HomePage() {
  const { signOut, session } = useSession();
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [scores, setScores] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchUpcomingEvents();
      fetchScores();
    }, [session])
  );

  const fetchUpcomingEvents = async () => {
    try {
      const response = await fetch(`${API_URL}/events`, {
        headers: { 'Authorization': `Bearer ${session}` }
      });
      const data = await response.json();
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const formatted = Object.keys(data).flatMap(dateStr => {
        const eventDate = new Date(dateStr + "T00:00:00"); 
    
        const diffTime = eventDate.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= 0) {
          return data[dateStr].map((event: any) => ({
            ...event,
            date: dateStr,
            daysLeft: diffDays
          }));
        }
        return [];
      }).sort((a, b) => a.daysLeft - b.daysLeft);

      setUpcomingEvents(formatted);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchScores = async () => {
    try {
      const response = await fetch(`${API_URL}/recent-scores`, {
        headers: { 'Authorization': `Bearer ${session}` }
      });
      const data = await response.json();
      setScores(data); 
    } catch (e) {
      console.error("Failed to fetch scores", e);
    }
  };

  const handleSignOut = () => {
    signOut();        
    router.replace('/sign-in');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome Back!</Text>
          <Text style={styles.subGreeting}>You have {upcomingEvents.length} upcoming tasks.</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={22} color="#ef4444" />
        </TouchableOpacity>
      </View>

      <View style={styles.mainCard}>
        <Text style={styles.cardLabel}>NEXT DEADLINE</Text>
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 20 }} />
        ) : upcomingEvents.length > 0 ? (
          <>
            <Text style={styles.countdownDays}>
              {upcomingEvents[0].daysLeft === 0 ? "TODAY" : `${upcomingEvents[0].daysLeft} Days`}
            </Text>
            <Text style={styles.countdownTarget}>{upcomingEvents[0].description}</Text>
          </>
        ) : (
          <Text style={styles.countdownTarget}>All caught up!</Text>
        )}
      </View>

      <View style={styles.actionGrid}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/AiChat')}>
          <Ionicons name="chatbubble-ellipses" size={24} color="#2563eb" />
          <Text style={styles.actionText}>Ask AI</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/calendar')}>
          <Ionicons name="calendar" size={24} color="#10b981" />
          <Text style={styles.actionText}>Calendar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>Agenda</Text>
        {upcomingEvents.slice(1, 4).map((item, index) => (
          <View key={index} style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.description}</Text>
              <Text style={styles.itemDate}>{item.date}</Text>
            </View>
            <View style={styles.daysTag}>
              <Text style={styles.daysTagText}>{item.daysLeft}d</Text>
            </View>
          </View>
        ))}
      </View>


      <View style={styles.scoreSection}>
        <Text style={styles.sectionTitle}>Performance</Text>
        <View style={styles.scoreCard}>
          <View style={styles.scoreItem}>
            <Text style={styles.scoreValue}>{scores?.total_tests || 0}</Text>
            <Text style={styles.scoreLabel}>Tests Completed</Text>
          </View>
          <View style={[styles.scoreItem, styles.scoreBorder]}>
            <Text style={[styles.scoreValue, { color: '#10b981' }]}>
              {scores?.avg_percentage || 0}%
            </Text>
            <Text style={styles.scoreLabel}>Avg. Accuracy</Text>
          </View>
        </View>
      </View>
      <View style={{ height: 40 }} /> 
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: TOP_PADDING },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  subGreeting: { color: '#64748b', fontSize: 14 },
  logoutBtn: { padding: 10, backgroundColor: '#fee2e2', borderRadius: 12 },
  mainCard: { margin: 20, padding: 25, backgroundColor: '#2563eb', borderRadius: 24, elevation: 4 },
  cardLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 'bold' },
  countdownDays: { color: '#fff', fontSize: 42, fontWeight: '900', marginVertical: 5 },
  countdownTarget: { color: '#fff', fontSize: 18 },
  actionGrid: { flexDirection: 'row', paddingHorizontal: 20, gap: 15 },
  actionBtn: { flex: 1, backgroundColor: '#fff', padding: 20, borderRadius: 20, alignItems: 'center', elevation: 2 },
  actionText: { marginTop: 8, fontWeight: '600', color: '#1e293b' },
  listSection: { paddingHorizontal: 20, paddingVertical: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 15 },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 10 },
  itemTitle: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  itemDate: { fontSize: 12, color: '#94a3b8' },
  daysTag: { backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  daysTagText: { fontWeight: 'bold', color: '#64748b' },
  scoreSection: { paddingHorizontal: 20, marginBottom: 20 },
  scoreCard: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  scoreItem: { flex: 1, alignItems: 'center' },
  scoreBorder: { borderLeftWidth: 1, borderLeftColor: '#f1f5f9' },
  scoreValue: { fontSize: 24, fontWeight: 'bold', color: '#1e293b' },
  scoreLabel: { fontSize: 12, color: '#64748b', marginTop: 4 }
});