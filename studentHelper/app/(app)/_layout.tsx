import { Tabs } from 'expo-router';

export default function AppLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="testGenerator" options={{ title: "Test Generator", headerShown: false }} />
      <Tabs.Screen name="schoolwork" options={{ title: "Analysis", headerShown: false }} />
      <Tabs.Screen name="AiChat" options={{ title: "Ai Chat", headerShown: false }} />
      <Tabs.Screen name="home" options={{ title: "Home", headerShown: false }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar", headerShown: false }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", headerShown: false }} />
    </Tabs>
  );
}
