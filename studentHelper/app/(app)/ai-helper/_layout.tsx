import { Tabs } from 'expo-router';

export default function AIHelperLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: 'blue'}}>
        <Tabs.Screen name="chat" options={{ title: "Chat", headerShown: false}} />
    </Tabs>
  );
}