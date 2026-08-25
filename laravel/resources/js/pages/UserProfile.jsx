import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getUserProfile } from '../api/auth';
import Avatar from '../components/Avatar';
import FavouriteAchievementBadges from '../components/FavouriteAchievementBadges';

function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [gems, setGems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    
    setLoading(true);
    setError('');
    
    getUserProfile(id)
      .then(res => {
        setUser(res.data.user);
        setGems(res.data.gems || []);
      })
      .catch(err => {
        console.error(err);
        setError(err.response?.data?.message || 'Failed to load user profile');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="hidden-gems-loading">
        <p>Loading user profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hidden-gems-empty">
        <p>{error}</p>
        <Link to="/" className="gem-detail-back-link">← Back to Home</Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="hidden-gems-empty">
        <p>User not found</p>
        <Link to="/" className="gem-detail-back-link">← Back to Home</Link>
      </div>
    );
  }

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const verifiedGems = gems.filter(g => g.status === 'hidden_gem').length;
  const pendingGems = gems.filter(g => g.status === 'pending_community_vote').length;

  return (
    <div className="profile-page">
      <div className="gem-detail-page">
        <Link 
          to="/hidden-gems" 
          className="gem-detail-back-link"
          onClick={(e) => {
            e.preventDefault();
            navigate(-1);
          }}
        >
          ← Back
        </Link>

        {/* Header Card */}
        <div className="profile-header-card">
          <div className="profile-header-body">
            <div className="profile-avatar-wrap">
              <Avatar name={user.name} avatarUrl={user.avatar_url} size="lg" />
            </div>
            <div className="profile-header-info">
              <div className="profile-name-row">
                <h2>{user.name}</h2>
              </div>
              <FavouriteAchievementBadges
                favourites={user.favourite_achievements}
                className="profile-achievement-badges public-profile-achievement-badges"
              />
              <p className="profile-header-email">{user.email}</p>
              <div className="profile-header-badges">
                {memberSince && <span className="profile-badge">Member since {memberSince}</span>}
                {user.email_verified_at && (
                  <span className="profile-badge profile-badge-verified">Email verified</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-card-value">{gems.length}</span>
            <span className="stat-card-label">Total Gems</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">{verifiedGems}</span>
            <span className="stat-card-label">Hidden Gems</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">{pendingGems}</span>
            <span className="stat-card-label">In Progress</span>
          </div>
        </div>

        {/* Hidden Gems Section */}
        <div className="profile-recent-section">
          <div className="trip-detail-section-header">
            <h2>Hidden Gems</h2>
          </div>

          {gems.length === 0 ? (
            <div className="hidden-gems-empty">
              <p>No hidden gems yet.</p>
            </div>
          ) : (
            <div className="hidden-gems-list profile-recent-list">
              {gems.map((gem) => (
                <div
                  key={gem.id}
                  className="hidden-gems-card"
                  onClick={() => navigate(`/hidden-gems/${gem.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="hidden-gems-card-image">
                    {gem.images && gem.images.length > 0 ? (
                      <img src={gem.images[0].image_url} alt={gem.place_name} />
                    ) : (
                      <div className="hidden-gems-card-no-image">No Image</div>
                    )}
                  </div>
                  <div className="hidden-gems-card-content">
                    <h2>{gem.place_name}</h2>
                    <div className="hidden-gems-card-tags">
                      <span className="hidden-gems-card-category">{gem.category?.name || 'Uncategorized'}</span>
                      <span className="hidden-gems-card-state">{gem.state || 'Unknown'}</span>
                    </div>
                    <div className="hidden-gems-card-status">
                      {gem.status === 'hidden_gem' ? (
                        <span className="hidden-gems-card-verified">Hidden Gem</span>
                      ) : gem.status === 'ai_rejected' ? (
                        <span className="hidden-gems-card-rejected">Not Accepted</span>
                      ) : gem.status === 'pending_community_vote' ? (
                        <span className="hidden-gems-card-voting">
                          {gem.vote_count || 0}/{gem.verification_threshold || 10} votes
                        </span>
                      ) : (
                        <span className="hidden-gems-card-pending">Being Verified</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserProfile;
