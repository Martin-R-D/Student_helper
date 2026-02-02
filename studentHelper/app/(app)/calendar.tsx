import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Calendar } from 'react-native-calendars';
import { API_URL } from '../../config/api';
import { useSession } from '../../ctx'
import { Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn, FadeInRight, Layout } from 'react-native-reanimated';

const TOP_PADDING = Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 0) + 10;

type EventType = 'homework' | 'test' | 'project';

interface CalendarEvent {
  type: EventType;
  description: string;
}

export default function CalendarScreen() {
  const { session } = useSession();
  const [isScanning, setIsScanning] = useState(false);
  const [markedDates, setMarkedDates] = useState({});
  const [events, setEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [eventType, setEventType] = useState<EventType>('homework');
  const [description, setDescription] = useState('');
  const [showForm, setShowForm] = useState(false);
  // Fetch events from API
  useEffect(() => {
    fetchEvents();
  }, [session]);

  const fetchEvents = async () => {
    try {
      const response = await fetch(`${API_URL}/events`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session}`
        }
      });
      const data = await response.json();
      setEvents(data || {});
      updateMarkedDates(data || {});
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };


  const handleAIScan = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'We need camera access to scan your schedule.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.4,
    });

    if (!result.canceled && result.assets[0].base64) {
      setIsScanning(true);
      try {
        const response = await fetch(`${API_URL}/chat/extract-events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session}`,
          },
          body: JSON.stringify({ image: result.assets[0].base64 }),
        });

        const data = await response.json();

        if (response.ok) {
          Alert.alert('Success', `AI found and added ${data.events.length} events!`);
          fetchEvents();
        } else {
          Alert.alert('AI Error', data.error || 'Could not process the image.');
        }
      } catch (err) {
        Alert.alert('Network Error', 'Connection to server failed.');
      } finally {
        setIsScanning(false);
      }
    }
  };


  const handleDeleteEvent = async (eventToDelete: CalendarEvent) => {
    Alert.alert("Delete Event", "Are you sure you want to remove this event?",
      [{ text: "Cancel", style: "cancel" }, {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            const response = await fetch(`${API_URL}/events/delete`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session}`
              },
              body: JSON.stringify({
                date: selectedDate,
                description: eventToDelete.description
              }),
            });

            if (response.ok) {
              fetchEvents();
            } else {
              Alert.alert('Error', 'Failed to delete event');
            }
          } catch (error) {
            Alert.alert('Error', 'Connection error');
          }
        }
      }
      ]
    );
  };



  const updateMarkedDates = (eventsData: Record<string, CalendarEvent[]>) => {
    const marked: Record<string, any> = {};
    Object.keys(eventsData).forEach(date => {
      const dayEvents = eventsData[date];
      let dotColor = 'blue';

      // Color based on event type
      if (dayEvents.some(e => e.type === 'test')) {
        dotColor = 'red';
      } else if (dayEvents.some(e => e.type === 'project')) {
        dotColor = 'orange';
      } else if (dayEvents.some(e => e.type === 'homework')) {
        dotColor = 'blue';
      }

      marked[date] = { marked: true, dotColor };
    });

    // Add blue circle to selected date
    marked[selectedDate] = {
      ...marked[selectedDate],
      selected: true,
      selectedColor: '#00adf5',
      selectedTextColor: '#ffffff',
    };

    setMarkedDates(marked);
  };

  const handleAddEvent = async () => {
    // Check if selected date is in the past
    const today = new Date().toISOString().split('T')[0];
    if (selectedDate < today) {
      Alert.alert('Error', 'You cannot add events to past dates');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session}`
        },
        body: JSON.stringify({
          date: selectedDate,
          type: eventType,
          description: description.trim(),
        }),
      });

      if (response.ok) {
        setDescription('');
        setShowForm(false);
        fetchEvents();
        Alert.alert('Success', 'Event added successfully');
      } else {
        Alert.alert('Error', 'Failed to add event');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add event');
      console.error('Error adding event:', error);
    }
  };

  const handleDateSelect = (day: any) => {
    setSelectedDate(day.dateString);
    // Update marked dates to show blue circle on new selection
    const updated: Record<string, any> = { ...markedDates };
    Object.keys(updated).forEach(date => {
      if (updated[date].selected) {
        delete updated[date].selected;
        delete updated[date].selectedColor;
        delete updated[date].selectedTextColor;
      }
    });
    updated[day.dateString] = {
      ...updated[day.dateString],
      selected: true,
      selectedColor: '#00adf5',
      selectedTextColor: '#ffffff',
    };
    setMarkedDates(updated);
  };

  const getEventColor = (type: EventType) => {
    switch (type) {
      case 'test':
        return '#FF6B6B';
      case 'project':
        return '#FFA500';
      case 'homework':
        return '#4A90E2';
      default:
        return '#999';
    }
  };

  const dayEvents = events[selectedDate] || [];

  return (
    <ScrollView style={styles.container}>
      <Animated.View entering={ZoomIn.duration(600).springify()}>
        <Calendar
          markedDates={markedDates}
          onDayPress={handleDateSelect}
          theme={{
            todayTextColor: '#00adf5',
            selectedDayBackgroundColor: '#00adf5',
            selectedDayTextColor: '#ffffff',
            dotColor: '#00adf5',
            selectedDotColor: '#ffffff',
            arrowColor: '#00adf5',
            monthTextColor: '#2d5016',
          }}
        />
      </Animated.View>

      {!showForm && (
        <TouchableOpacity style={styles.addButtonContainer} onPress={() => setShowForm(true)}>
          <Text style={styles.addButtonContainerText}>Add Event</Text>
        </TouchableOpacity>
      )}

      {showForm && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.formContainer}>
          <Text style={styles.label}>Selected Date: {selectedDate}</Text>

          <Text style={styles.label}>Event Type</Text>
          <View style={styles.typeButtonsContainer}>
            {(['homework', 'test', 'project'] as EventType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeButton,
                  eventType === type && styles.typeButtonActive,
                  { backgroundColor: eventType === type ? getEventColor(type) : '#e0e0e0' },
                ]}
                onPress={() => setEventType(type)}
              >
                <Text
                  style={{
                    color: eventType === type ? '#fff' : '#333',
                    fontWeight: 'bold',
                    textTransform: 'capitalize',
                  }}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter event description..."
            value={description}
            onChangeText={setDescription}
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity style={styles.submitButton} onPress={handleAddEvent}>
            <Text style={styles.submitButtonText}>Save</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={() => setShowForm(false)}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {dayEvents.length > 0 && (
        <View style={styles.eventsListContainer}>
          <Text style={styles.eventsTitle}>Events for {selectedDate}:</Text>
          {dayEvents.map((event, index) => (
            <Animated.View
              key={index}
              entering={FadeInRight.delay(index * 100).springify()}
              layout={Layout.springify()}
              style={[
                styles.eventItem,
                { borderLeftColor: getEventColor(event.type) },
              ]}
            >
              <Text style={styles.eventType}>{event.type.toUpperCase()}</Text>
              <Text style={styles.eventDescription}>{event.description}</Text>
              <TouchableOpacity onPress={() => handleDeleteEvent(event)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      )}

      {!showForm && (
        <Animated.View entering={FadeInDown.delay(300)} style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#00adf5' }]}
            onPress={() => setShowForm(true)}
          >
            <Text style={styles.buttonText}>Manual Add</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#6200ee' }]}
            onPress={handleAIScan}
            disabled={isScanning}
          >
            {isScanning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Scan with AI</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: TOP_PADDING,
  },
  addButtonContainer: {
    backgroundColor: '#00adf5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    margin: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonContainerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  formContainer: {
    padding: 20,
    backgroundColor: '#f5f5f5',
    marginTop: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
    marginTop: 15,
  },
  typeButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    gap: 10,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  addButton: {
    backgroundColor: '#00adf5',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#00adf5',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#ccc',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  eventsListContainer: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingHorizontal: 20,
    paddingBottom: 40
  },
  eventsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  eventItem: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 6,
    marginBottom: 10,
    borderLeftWidth: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2
  },
  eventType: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#666',
  },
  eventDescription: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    marginRight: 10
  },
  eventContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deleteButton: {
    padding: 8,
  },
});