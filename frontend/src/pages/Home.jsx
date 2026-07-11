import { Link } from 'react-router-dom';

function Home({ user }) {
  return (
    <div>
      <h1>Welcome, {user.name}!</h1>
      <p>What would you like to do today?</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 300, marginTop: '1.5rem' }}>
        <Link to="/map" style={cardStyle}>🗺️ Interactive Map</Link>
        <Link to="/hidden-gems" style={cardStyle}>💎 Hidden Gem Management</Link>
        <Link to="/travel-posts" style={cardStyle}>📝 Travel Posts</Link>
        <Link to="/trip-itinerary" style={cardStyle}>🧳 Trip Itinerary</Link>
        <Link to="/profile" style={cardStyle}>👤 My Profile</Link>
      </div>
    </div>
  );
}

const cardStyle = {
  display: 'block',
  padding: '1rem',
  border: '1px solid #ccc',
  borderRadius: '8px',
  textDecoration: 'none',
  color: '#1e293b',
  background: '#f8fafc',
};

export default Home;