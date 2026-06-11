import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { initializeDevice } from '../services/twilioCallService';

const TwilioContext = createContext({});

export function TwilioProvider({ children }) {
  const { user } = useAuth();
  const [isDeviceReady, setIsDeviceReady] = useState(false);
  const [deviceError, setDeviceError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const initDevice = async () => {
    if (!user?.id || isInitializing) return;
    setIsInitializing(true);
    setDeviceError(null);
    try {
      await initializeDevice(user.id);
      setIsDeviceReady(true);
    } catch (err) {
      setDeviceError(err.message);
      setIsDeviceReady(false);
    } finally {
      setIsInitializing(false);
    }
  };

  // Auto-init when user logs in
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user?.id) {
      initDevice();
    } else {
      setIsDeviceReady(false);
    }
  }, [user?.id]); // initDevice intentionally omitted to avoid infinite loop

  return (
    <TwilioContext.Provider value={{ isDeviceReady, deviceError, isInitializing, initDevice }}>
      {children}
    </TwilioContext.Provider>
  );
}

export function useTwilio() {
  return useContext(TwilioContext);
}
