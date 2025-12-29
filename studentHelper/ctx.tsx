import { useContext, createContext, type PropsWithChildren } from 'react';

import { useStorageState } from './useStorageState';

const AuthContext = createContext<{
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  register: (email: string, password: string) => Promise<void>;
  session?: string | null;
  isLoading: boolean;
}>({
  signIn: async () => {},
  signOut: () => null,
  register: async () => {},
  session: null,
  isLoading: false,
});


export function useSession() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useSession must be wrapped in a <SessionProvider />');
  }

  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [[isLoading, session], setSession] = useStorageState('session');
  const API_URL = "http://192.168.100.13:5000";
  const signIn = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      throw new Error("Invalid email or password");
    }

    const data = await res.json();
    setSession(data.access_token);
  };

  const signOut = () => {
    setSession(null);
  };


  const register = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Registration failed');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        signIn,
        signOut,
        register,
        session,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
