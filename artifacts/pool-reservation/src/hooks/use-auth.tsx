import React, { createContext, useContext, useState, ReactNode } from 'react';
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
  isStaff: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('pool_token'));
  // Optimistic user set by login() before /me has fetched; the server response (meData)
  // is the source of truth once it arrives (and after a profile edit re-fetch).
  const [loginUser, setLoginUser] = useState<User | null>(null);

  const { data: meData, isError: meError } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });

  // Derive user directly (no effect lag) so there's never a render where the token is
  // present but user is momentarily null — that gap used to make ProtectedRoute redirect
  // deep-links to "/" (and then to /dashboard), so /profile etc. were unreachable.
  const user = meData ?? loginUser ?? null;

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('pool_token', newToken);
    setToken(newToken);
    setLoginUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('pool_token');
    setToken(null);
    setLoginUser(null);
    window.location.href = '/';
  };

  // Still resolving as long as we have a token, no user yet, and /me hasn't errored.
  const isLoading = !!token && !user && !meError;
  const isAuthenticated = !!user && !!token;
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isInstructor = user?.role === 'instructor';
  const isStaff = user?.role === 'staff'; // employee (clocks in/out, not admin/instructor)

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, isAuthenticated, isAdmin, isInstructor, isStaff }}>
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
