import { Stack } from 'expo-router';

import { SessionProvider, useSession } from '../ctx';
import { SplashScreenController } from './splash';

export default function Root() {
 
  return (
    <SessionProvider>
      <SplashScreenController />
      <RootNavigator />
    </SessionProvider>
  );
}


function RootNavigator() {
  const { session } = useSession();

  return (
    <Stack>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" options={{headerShown: false}}/>
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="register" options={{headerShown: false}} />
        <Stack.Screen name="sign-in" options={{headerShown:false}}/>
      </Stack.Protected>
    </Stack>
  );
}

