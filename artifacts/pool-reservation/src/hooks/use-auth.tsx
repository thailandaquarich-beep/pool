import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useGetMe, getGetMeQueryKey, User } from '@workspace/api-client-react';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isInstructor: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('pool_token'));
  const [user, setUser] = useState<User | null>(null);

  const { data: meData, isLoading: meLoading } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });

  useEffect(() => {
    if (meData) {
      setUser(meData);
    }
  }, [meData]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('pool_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('pool_token');
    setToken(null);
    setUser(null);
    window.location.href = '/';
  };

  const isLoading = !!token && meLoading && !user;
  const isAuthenticated = !!user && !!token;
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isInstructor = user?.role === 'instructor';

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, isAuthenticated, isAdmin, isInstructor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
