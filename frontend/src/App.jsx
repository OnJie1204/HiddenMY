import { useState, useEffect } from 'react';
import Login from './Login';
import Register from './Register';
import MapPage from './Maps';
import api from './api';

function App() {
  const [user, setUser] = useState(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/me').then(res => setUser(res.data)).catch(() => {
        localStorage.removeItem('token');
      });
    }
  }, []);

  const handleLogout = async () => {
    await api.post('/logout');
    localStorage.removeItem('token');
    setUser(null);
  };

  if (user) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Welcome, {user.name}!</h1>
        <p>Email: {user.email}</p>
        <button onClick={handleLogout}>Logout</button>
        <MapPage />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      {showRegister ? (
        <>
          <Register onRegisterSuccess={setUser} />
          <p>Already have account? <button onClick={() => setShowRegister(false)}>Login</button></p>
        </>
      ) : (
        <>
          <Login onLoginSuccess={setUser} />
          <p>still doesn't have account? <button onClick={() => setShowRegister(true)}>Register</button></p>
        </>
      )}
    </div>
  );
}

export default App;