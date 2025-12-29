import React, { useState, useEffect } from 'react';
import { Calendar } from 'react-native-calendars';

const API_URL = "http://192.168.0.105:5000/events"; 

export default function CalendarScreen() {
  const [markedDates, setMarkedDates] = useState({});

  useEffect(() => {
    fetch(API_URL)
      .then(res => res.json())
      .then(data => {
        const formatted: Record<string, { marked: boolean; dotColor: string; selected: boolean }> = {};
        Object.keys(data).forEach(date => {
          formatted[date] = { marked: true, dotColor: 'blue', selected: true };
        });
        setMarkedDates(formatted);
      });
  }, []);

  return (
    <Calendar
      markedDates={markedDates}
      onDayPress={(day) => console.log('selected day', day)}
    />
  );
}