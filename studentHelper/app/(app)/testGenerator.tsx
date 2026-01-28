import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  TextInput, ActivityIndicator, Alert, Platform, StatusBar 
} from 'react-native';
import { useSession } from '../../ctx';
import { useFocusEffect } from 'expo-router';
import { API_URL } from '../../config/api';
import { Ionicons } from '@expo/vector-icons';

const TOP_PADDING = Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 0) + 10;

export default function TestGeneratorScreen() {
  const { session } = useSession();
  
  const [upcomingTests, setUpcomingTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  

  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [context, setContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  

  const [quiz, setQuiz] = useState<any[] | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [score, setScore] = useState<number | null>(null);
 
  useFocusEffect(
    useCallback(() => {
      fetchTests();
    }, [])
  );

  const fetchTests = async () => {
    try {
      const response = await fetch(`${API_URL}/events`, {
        headers: { 'Authorization': `Bearer ${session}` }
      });
      const data = await response.json();
      
      const tests = Object.keys(data).flatMap(date => 
        data[date].filter((e: any) => e.type === 'test')
          .map((e: any) => ({ ...e, date }))
      );
      setUpcomingTests(tests);
    } catch (e) {
      Alert.alert("Error", "Could not load upcoming tests.");
    } finally {
      setLoading(false);
    }
  };

  const generateQuiz = async () => {
    if (!context.trim()) return Alert.alert("Context Required", "Please paste your study notes first.");
    
    setIsGenerating(true);
    try {
      const response = await fetch(`${API_URL}/chat/generate-test`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session}` 
        },
        body: JSON.stringify({ 
            subject: selectedTest.description,
            context: context 
        }),
      });
      const data = await response.json();
      setQuiz(data.questions);
    } catch (e) {
      Alert.alert("AI Error", "Couldn't generate the test. Check your backend connection.");
    } finally {
      setIsGenerating(false);
    }
  };

  const calculateScore = async () => {
    if (Object.keys(userAnswers).length < (quiz?.length || 0)) {
        return Alert.alert("Unfinished", "Please answer all questions before finishing.");
    }
    let correctCount = 0;
    quiz?.forEach((q, index) => {
      if (userAnswers[index] === q.correct) correctCount++;
    });
    setScore(correctCount);

    try {
      await fetch(`${API_URL}/save-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session}`
        },
        body: JSON.stringify({
          subject: selectedTest.description,
          score: correctCount,
          total: quiz?.length
        })
      });
      } catch (error) {
        console.error("Failed to save score:", error);
      }
  };

  const resetQuiz = () => {
    setQuiz(null);
    setScore(null);
    setSelectedTest(null);
    setContext('');
    setUserAnswers({});
  };

  if (quiz) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity style={styles.backLink} onPress={resetQuiz}>
            <Ionicons name="arrow-back" size={20} color="#2563eb" />
            <Text style={styles.backLinkText}>Cancel</Text>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Practice: {selectedTest.description}</Text>
        <Text style={styles.subTitle}>Select the correct answer for each question.</Text>

        {quiz.map((q, index) => (
          <View key={index} style={styles.quizCard}>
            <Text style={styles.questionText}>{index + 1}. {q.question}</Text>
            {q.options.map((opt: string) => {
              let buttonStyle: any[] = [styles.optionBtn];
              let textStyle: any = { color: '#1e293b' };

              if (score !== null) {
                if (opt === q.correct) {
                  buttonStyle.push(styles.optionCorrect);
                  textStyle = { color: '#fff' };
                } else if (opt === userAnswers[index] && opt !== q.correct) {
                  buttonStyle.push(styles.optionWrong);
                  textStyle = { color: '#fff' };
                }
              } else if (userAnswers[index] === opt) {
                buttonStyle.push(styles.optionSelected);
                textStyle = { color: '#fff' };
              }

              return (
                <TouchableOpacity 
                  key={opt} 
                  style={buttonStyle}
                  onPress={() => score === null && setUserAnswers({...userAnswers, [index]: opt})}
                  disabled={score !== null}
                >
                  <Text style={textStyle}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {score === null ? (
          <TouchableOpacity style={styles.submitBtn} onPress={calculateScore}>
            <Text style={styles.btnText}>Finish and Calculate Score</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.resultCard}>
            <Text style={styles.scoreText}>Result: {score} / {quiz.length}</Text>
            <Text style={styles.scoreSubText}>
                {score === quiz.length ? "Perfect! You are ready!" : "Review your mistakes in red above."}
            </Text>
            <TouchableOpacity style={styles.resetBtn} onPress={resetQuiz}>
              <Text style={styles.btnText}>Try Another Topic</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>AI Study Coach</Text>
      <Text style={styles.subTitle}>Select an upcoming test to prepare.</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{marginTop: 50}} />
      ) : upcomingTests.length > 0 ? (
        upcomingTests.map((test, i) => (
            <TouchableOpacity 
                key={i} 
                style={[styles.testItem, selectedTest === test && styles.testSelected]} 
                onPress={() => setSelectedTest(test)}
            >
              <Ionicons name="school" size={24} color={selectedTest === test ? "#fff" : "#2563eb"} />
              <View style={{marginLeft: 15}}>
                <Text style={[styles.testName, selectedTest === test && {color: '#fff'}]}>{test.description}</Text>
                <Text style={[styles.testDate, selectedTest === test && {color: 'rgba(255,255,255,0.7)'}]}>{test.date}</Text>
              </View>
            </TouchableOpacity>
          ))
      ) : (
        <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No upcoming tests found in your calendar.</Text>
        </View>
      )}

      {selectedTest && (
        <View style={styles.contextArea}>
          <Text style={styles.label}>Paste Notes or Specific Topics:</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Example: The test covers the Water Cycle, condensation, and evaporation..."
            multiline
            value={context}
            onChangeText={setContext}
          />
          <TouchableOpacity 
            style={styles.generateBtn} 
            onPress={generateQuiz}
            disabled={isGenerating}
          >
            {isGenerating ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Generate Practice Test</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: TOP_PADDING, paddingHorizontal: 20 },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#1e293b', marginBottom: 5 },
  subTitle: { fontSize: 14, color: '#64748b', marginBottom: 25 },
  backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  backLinkText: { color: '#2563eb', marginLeft: 5, fontWeight: '600' },
  testItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 18, borderRadius: 20, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  testSelected: { backgroundColor: '#2563eb' },
  testName: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  testDate: { fontSize: 13, color: '#64748b' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#94a3b8', textAlign: 'center' },
  contextArea: { marginTop: 10, padding: 20, backgroundColor: '#fff', borderRadius: 24, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15, marginBottom: 40 },
  label: { fontWeight: '700', marginBottom: 12, color: '#334155' },
  textArea: { backgroundColor: '#f1f5f9', borderRadius: 15, padding: 15, height: 120, textAlignVertical: 'top', fontSize: 15 },
  generateBtn: { backgroundColor: '#2563eb', padding: 18, borderRadius: 15, marginTop: 20, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  quizCard: { backgroundColor: '#fff', padding: 20, borderRadius: 24, marginBottom: 20, elevation: 2 },
  questionText: { fontSize: 17, fontWeight: '700', color: '#1e293b', marginBottom: 20, lineHeight: 24 },
  optionBtn: { padding: 16, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, marginBottom: 10 },
  optionSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  optionCorrect: { backgroundColor: '#10b981', borderColor: '#10b981' },
  optionWrong: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  submitBtn: { backgroundColor: '#10b981', padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 20 },
  resultCard: { alignItems: 'center', padding: 20, backgroundColor: '#fff', borderRadius: 24, marginBottom: 40 },
  scoreText: { fontSize: 32, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  scoreSubText: { fontSize: 16, color: '#64748b', marginBottom: 25, textAlign: 'center' },
  resetBtn: { backgroundColor: '#334155', padding: 18, borderRadius: 16, width: '100%', alignItems: 'center' }
});