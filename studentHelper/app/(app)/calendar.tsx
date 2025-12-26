import { View, Text, Button } from 'react-native';
import { useSession } from '../../ctx';
import { router } from 'expo-router';

export default function CalendarPage() {
  const { signOut } = useSession();

  const handleSignOut = () => {
    signOut();        
    router.replace('/sign-in');
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Calendar Page</Text>
      <Button title="Sign Out" onPress={handleSignOut} />
    </View>
  );
}
