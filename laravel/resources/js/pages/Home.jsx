import { Link } from 'react-router-dom';

const destinations = [
  {
    to: '/map',
    icon: '🗺️',
    color: '#e6f6f3',
    title: 'Interactive Map',
    desc: 'Explore hidden gems and attractions across Malaysia on the map.',
  },
  {
    to: '/hidden-gems',
    icon: '💎',
    color: '#ffe4e8',
    title: 'Hidden Gem Management',
    desc: 'Browse, submit, and manage hidden gem locations.',
  },
  {
    to: '/travel-posts',
    icon: '📝',
    color: '#fef3c7',
    title: 'Travel Posts',
    desc: 'Read and share travel stories from the community.',
  },
  {
    to: '/trip-itinerary',
    icon: '✈️',
    color: '#e0f2fe',
    title: 'Trip Itinerary',
    desc: 'Plan your trips and organise your stopping points.',
  },
  {
    to: '/profile',
    icon: '👤',
    color: '#ede9fe',
    title: 'My Profile',
    desc: 'Manage your account details and preferences.',
  },
];

function Home({ user }) {
  return (
    <div>
      <div className="home-hero">
        <h1 className="home-title">Welcome back, {user.name}!</h1>
        <p className="home-subtitle">Where are you headed today?</p>
      </div>

      <div className="home-grid">
        {destinations.map(({ to, icon, color, title, desc }) => (
          <Link key={to} to={to} className="home-card">
            <span className="home-card-icon" style={{ '--home-card-color': color }} aria-hidden="true">
              {icon}
            </span>
            <span className="home-card-title">{title}</span>
            <span className="home-card-desc">{desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Home;