import { createContext, useContext, useState, useEffect } from 'react';
import socket from '../socket'; // נתיב לפי מיקום הקובץ שלך

const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (user) {
      socket.emit('user-connected', user);
    }
  }, [user]);

  return (
    <UserContext.Provider value={{ user, setUser, socket }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}