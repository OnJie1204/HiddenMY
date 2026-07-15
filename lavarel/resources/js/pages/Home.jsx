import { Link } from 'react-router-dom';

function Home({ user }) {
  return (
    <div>
      <h1 className="home-title">Welcome, {user.name}!</h1>
      <p className="home-subtitle">What would you like to do today?</p>

      <div className="home-grid">
        <Link to="/map" className="home-card">Interactive Map</Link>
        <Link to="/hidden-gems" className="home-card">Hidden Gem Management</Link>
        <Link to="/travel-posts" className="home-card">Travel Posts</Link>
        <Link to="/trip-itinerary" className="home-card">Trip Itinerary</Link>
        <Link to="/profile" className="home-card">My Profile</Link>
      </div>
    </div>
  );
}

export default Home;