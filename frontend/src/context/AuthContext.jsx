import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('lis_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => localStorage.removeItem('lis_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const data = await api.login({ username, password });
    localStorage.setItem('lis_token', data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('lis_token');
    setUser(null);
  };

  const hasMenu = (key) => user?.menus?.includes(key);
  const can = (code) => user?.permissions?.some((p) => p.code === code) || user?.role?.code === 'admin';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasMenu, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
