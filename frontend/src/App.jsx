import { useEffect, useState } from 'react';
import axios from 'axios';

function App() {
    const [message, setMessage] = useState('Loading...');

    useEffect(() => {
        axios.get('http://127.0.0.1:8000/api/ping')
            .then(res => setMessage(res.data.message))
            .catch(err => setMessage('Error: ' + err.message));
    }, []);

    return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
            <h1>Gemora</h1>
            <p>Backend says: {message}</p>
        </div>
    );
}

export default App;