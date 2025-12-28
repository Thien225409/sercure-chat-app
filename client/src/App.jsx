import React, { useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Chat from './components/Chat';

export const ClientContext = React.createContext();

function App() {
  // Dùng useRef để giữ instance của MessengerClient không bị re-render mất
  const clientRef = useRef(null); 
  const [user, setUser] = useState(null); // Thông tin user logged in

  return (
    <ClientContext.Provider value={{ clientRef, user, setUser }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* <Route 
            path="/chat" 
            element={user ? <Chat /> : <Navigate to="/login" />} 
          /> */}
          <Route path="/chat" element={<Chat />} />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </ClientContext.Provider>
  );
}

export default App;