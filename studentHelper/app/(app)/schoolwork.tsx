import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, Alert, Platform, KeyboardAvoidingView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../../ctx';
import { API_URL } from '../../config/api';
import Markdown from 'react-native-markdown-display';
import { useLocalSearchParams } from 'expo-router';

export default function SchoolworkAnalysisScreen() {
    const { session } = useSession();
    const params = useLocalSearchParams();

    const [mode, setMode] = useState<'create' | 'view'>('create');

    // Create Mode State
    const [type, setType] = useState<'past_exam' | 'project' | 'homework'>('past_exam');
    const [subject, setSubject] = useState('');
    const [grade, setGrade] = useState('');
    const [mistakes, setMistakes] = useState('');
    const [notes, setNotes] = useState('');
    const [topic, setTopic] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // View Mode State
    const [analysisContent, setAnalysisContent] = useState<string | null>(null);
    const [viewTitle, setViewTitle] = useState('');
    const [loadingView, setLoadingView] = useState(false);

    useEffect(() => {
        const loadAnalysis = async (id: string) => {
            setMode('view');
            setLoadingView(true);
            try {
                const res = await fetch(`${API_URL}/schoolwork/${id}`, {
                    headers: { 'Authorization': `Bearer ${session}` }
                });
                const data = await res.json();
                if (res.ok) {
                    setAnalysisContent(data.content);
                    setViewTitle(data.subject + (data.topic ? `: ${data.topic}` : ''));
                } else {
                    Alert.alert("Error", "Could not load analysis.");
                    setMode('create');
                }
            } catch (e) {
                console.log(e);
                Alert.alert("Error", "Network error.");
                setMode('create');
            } finally {
                setLoadingView(false);
            }
        };

        if (params.analysisId) {
            loadAnalysis(params.analysisId as string);
        } else {
            resetForm();
        }
    }, [params.analysisId]);

    const takePhoto = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return Alert.alert('Permission Denied', 'Camera access is needed.');

        const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
        if (!result.canceled && result.assets[0].base64) {
            setImages([...images, result.assets[0].base64]);
        }
    };

    const removeImage = (index: number) => {
        const newImages = [...images];
        newImages.splice(index, 1);
        setImages(newImages);
    };

    const submitAnalysis = async () => {
        if (!subject) return Alert.alert("Missing Info", "Please enter a subject.");

        setLoading(true);
        try {
            const payload = { type, subject, grade, mistakes, notes, topic, images };
            const response = await fetch(`${API_URL}/chat/analyze-schoolwork`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session}` },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (response.ok) {
                setAnalysisContent(data.analysis);
                setViewTitle(subject);
                setMode('view');
            } else {
                Alert.alert("Error", data.error || "Analysis failed.");
            }
        } catch (e) {
            console.log(e);
            Alert.alert("Error", "Network request failed.");
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setMode('create');
        setAnalysisContent(null);
        setSubject('');
        setGrade('');
        setMistakes('');
        setNotes('');
        setTopic('');
        setImages([]);
    };

    if (mode === 'view') {
        return (
            <View style={styles.container}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={resetForm} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#1e293b" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>{viewTitle || "Analysis"}</Text>
                </View>
                {loadingView ? <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 50 }} /> : (
                    <ScrollView style={styles.resultScroll}>
                        <View style={styles.markdownBox}>
                            <Markdown style={markdownStyles}>{analysisContent}</Markdown>
                        </View>
                    </ScrollView>
                )}
            </View>
        )
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={{ marginBottom: 20 }}>
                    <Text style={styles.headerTitle}>New Analysis</Text>
                    <Text style={styles.subTitle}>Get AI insights for your tasks</Text>
                </View>

                <View style={styles.card}>
                    <View style={styles.typeSelector}>
                        {(['past_exam', 'project', 'homework'] as const).map((t) => (
                            <TouchableOpacity
                                key={t}
                                style={[styles.typeBtn, type === t && styles.typeBtnSelected]}
                                onPress={() => setType(t)}
                            >
                                <Text style={[styles.typeText, type === t && styles.typeTextSelected]}>
                                    {t === 'past_exam' ? 'Exam' : t.charAt(0).toUpperCase() + t.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={styles.label}>Subject</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Mathematics"
                        placeholderTextColor="#94a3b8"
                        value={subject}
                        onChangeText={setSubject}
                    />

                    {type === 'past_exam' && (
                        <View style={styles.row}>
                            <View style={{ flex: 1, marginRight: 10 }}>
                                <Text style={styles.label}>Grade</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. B+"
                                    placeholderTextColor="#94a3b8"
                                    value={grade}
                                    onChangeText={setGrade}
                                />
                            </View>
                        </View>
                    )}

                    {(type === 'project' || type === 'homework') && (
                        <>
                            <Text style={styles.label}>Topic</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Specific topic..."
                                placeholderTextColor="#94a3b8"
                                value={topic}
                                onChangeText={setTopic}
                            />
                        </>
                    )}

                    <Text style={styles.label}>
                        {type === 'past_exam' ? 'Mistakes / Context' : 'Details / Notes'}
                    </Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Describe what you need help with..."
                        placeholderTextColor="#94a3b8"
                        multiline
                        value={type === 'past_exam' ? mistakes : notes}
                        onChangeText={type === 'past_exam' ? setMistakes : setNotes}
                    />

                    <Text style={styles.label}>Attachments</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attachScroll}>
                        <TouchableOpacity style={styles.addImgBtn} onPress={takePhoto}>
                            <Ionicons name="camera" size={24} color="#64748b" />
                        </TouchableOpacity>
                        {images.map((img, i) => (
                            <View key={i} style={styles.imgPreview}>
                                <Image source={{ uri: `data:image/jpeg;base64,${img}` }} style={styles.previewImage} />
                                <TouchableOpacity style={styles.removeBtn} onPress={() => removeImage(i)}>
                                    <Ionicons name="close" size={12} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>

                    <TouchableOpacity
                        style={styles.submitBtn}
                        onPress={submitAnalysis}
                        disabled={loading}
                    >
                        {loading ? <ActivityIndicator color="#fff" /> : (
                            <>
                                <Ionicons name="sparkles" size={20} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.submitText}>Generate Analysis</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const markdownStyles = StyleSheet.create({
    body: { fontSize: 16, color: '#334155', lineHeight: 26 },
    heading1: { fontSize: 26, fontWeight: '800', color: '#1e293b', marginTop: 24, marginBottom: 12 },
    heading2: { fontSize: 22, fontWeight: '700', color: '#2563eb', marginTop: 20, marginBottom: 10 },
    heading3: { fontSize: 18, fontWeight: '700', color: '#475569', marginTop: 16, marginBottom: 8 },
    strong: { fontWeight: '700', color: '#0f172a' },
    link: { color: '#2563eb', textDecorationLine: 'underline' },
    list_item: { marginBottom: 8, flexDirection: 'row', alignItems: 'flex-start' },
    bullet_list_icon: { color: '#2563eb', fontSize: 18, marginRight: 8 },
    blockquote: { backgroundColor: '#f0f9ff', padding: 12, borderLeftWidth: 4, borderLeftColor: '#2563eb', marginVertical: 10, fontStyle: 'italic', color: '#334155' },
    code_inline: { backgroundColor: '#f1f5f9', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', paddingHorizontal: 4, borderRadius: 4, color: '#e11d48' },
    code_block: { backgroundColor: '#1e293b', padding: 15, borderRadius: 10, marginVertical: 10 },
    fence: { backgroundColor: '#1e293b', padding: 15, borderRadius: 10, marginVertical: 10, color: '#f8fafc' },
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    backBtn: { padding: 8, backgroundColor: '#fff', borderRadius: 12, marginRight: 15, elevation: 2 },
    headerTitle: { fontSize: 28, fontWeight: '800', color: '#1e293b', flex: 1 },
    subTitle: { fontSize: 16, color: '#64748b', fontWeight: '500' },

    card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, shadowColor: '#64748b', shadowOpacity: 0.1, shadowRadius: 20, elevation: 5 },

    typeSelector: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 16, padding: 4, marginBottom: 24 },
    typeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 14 },
    typeBtnSelected: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    typeText: { fontWeight: '600', color: '#94a3b8', fontSize: 14 },
    typeTextSelected: { color: '#2563eb', fontWeight: '700' },

    label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 16, fontSize: 16, color: '#1e293b' },
    textArea: { height: 120, textAlignVertical: 'top' },
    row: { flexDirection: 'row' },

    attachScroll: { flexDirection: 'row', marginTop: 5, marginBottom: 15 },
    addImgBtn: { width: 80, height: 80, borderRadius: 16, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#e2e8f0', borderStyle: 'dashed', marginRight: 10 },
    imgPreview: { width: 80, height: 80, borderRadius: 16, overflow: 'hidden', marginRight: 10 },
    previewImage: { width: '100%', height: '100%' },
    removeBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: '#ef4444', borderRadius: 8, padding: 4 },

    submitBtn: { backgroundColor: '#2563eb', padding: 20, borderRadius: 18, marginTop: 30, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: '#2563eb', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
    submitText: { color: '#fff', fontWeight: 'bold', fontSize: 17 },

    resultScroll: { flex: 1 },
    markdownBox: { backgroundColor: '#fff', borderRadius: 24, padding: 24, minHeight: 400, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 40 }
});
