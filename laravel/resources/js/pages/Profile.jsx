import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { getMe, getUserProfile, updateProfile, changePassword, uploadAvatar } from '../api/auth';
import { getMyHiddenGems } from '../api/hiddenGems';
import { getTripItineraries } from '../api/TripItinerary';
import { getMyTravelPosts } from '../api/travelPosts';
import PhotoCarousel from '../components/PhotoCarousel';
import { getFavouriteAchievements } from '../api/achievements';
import { getPasswordStrength } from '../utils/password';
import Avatar from '../components/Avatar';
import FavouriteAchievementBadges from '../components/FavouriteAchievementBadges';

function Profile({ setAppUser }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [hasPassword, setHasPassword] = useState(true);

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [stats, setStats] = useState({ totalGems: 0, verifiedGems: 0, pendingGems: 0, totalTrips: 0, totalPosts: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [recentGems, setRecentGems] = useState([]);
  const [recentPosts, setRecentPosts] = useState([]);
  const [favouriteAchievements, setFavouriteAchievements] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  // 判断是不是自己的 profile
  const isOwnProfile = !id;

  useEffect(() => {
    if (isOwnProfile) {
      setLoading(true);
      Promise.all([getMe(), getFavouriteAchievements()]).then(([userRes, favouritesRes]) => {
        setUser(userRes.data);
        setName(userRes.data.name);
        setEmail(userRes.data.email);
        setHasPassword(userRes.data.has_password);
        setFavouriteAchievements(favouritesRes.data.data || []);
      }).finally(() => setLoading(false));
    } else {
      setLoading(true);
      getUserProfile(id)
        .then(res => {
          setUser(res.data.user);
          setRecentGems(res.data.gems || []);
          setFavouriteAchievements(res.data.user?.favourite_achievements || []);
        })
        .catch(err => setError(err.response?.data?.message || 'Failed to load user profile'))
        .finally(() => setLoading(false));
    }
  }, [id, isOwnProfile]);

  useEffect(() => {
    if (!isOwnProfile) {
      setStatsLoading(false);
      return;
    }

    setStatsLoading(true);
    Promise.all([getMyHiddenGems(), getTripItineraries(), getMyTravelPosts()])
      .then(([gemsRes, tripsRes, postsRes]) => {
        const gems = gemsRes.data.data || [];
        const trips = tripsRes.data || [];
        const posts = postsRes.data.data || [];
        const verifiedGems = gems.filter((gem) => gem.status === 'hidden_gem').length;
        const pendingGems = gems.filter((gem) => gem.status === 'pending' || gem.status === 'pending_community_vote').length;

        setStats({
          totalGems: gems.length,
          verifiedGems,
          pendingGems,
          totalTrips: trips.length,
          totalPosts: posts.length,
        });
        setRecentGems(gems.slice(0, 3));
        setRecentPosts(posts.slice(0, 3));
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [isOwnProfile]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError('');
    setAvatarUploading(true);
    try {
      const res = await uploadAvatar(file);
      setUser(res.data.user);
      setAppUser(res.data.user);
    } catch (err) {
      setAvatarError(err.response?.data?.message || 'Avatar upload failed');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileMessage('');
    try {
      const res = await updateProfile({ name, email });
      setUser(res.data.user);
      setAppUser(res.data.user);
      setProfileMessage(res.data.message);
    } catch (err) {
      const errors = err.response?.data?.errors;
      setProfileError(errors ? Object.values(errors).flat().join(', ') : 'Update failed');
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    try {
      await changePassword({
        current_password: hasPassword ? currentPassword : undefined,
        new_password: newPassword,
        new_password_confirmation: newPasswordConfirmation,
      });
      setPasswordMessage(hasPassword ? 'Password changed successfully' : 'Password set successfully');
      setHasPassword(true);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirmation('');
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Password update failed');
    }
  };

  const newPasswordStrength = getPasswordStrength(newPassword);

  if (error) return <p>{error}</p>;
  if (loading || !user) return (
    <div className="profile-page">
      <div className="page-loading-bar" role="progressbar" aria-label="Loading profile">
        <div className="page-loading-bar-indicator" />
      </div>
    </div>
  );

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const verifiedGems = recentGems.filter(g => g.status === 'hidden_gem').length;
  const pendingGems = recentGems.filter(g => g.status === 'pending_community_vote').length;

  return (
    <div className="profile-page">
      <div className="gem-detail-page">
        <h1 className="page-title">{isOwnProfile ? 'My Profile' : 'User Profile'}</h1>

        {/* Header Card */}
        <div className="profile-header-card">
          <div className="profile-header-body">
            <div className="profile-avatar-wrap">
              <Avatar name={user.name} avatarUrl={user.avatar_url} size="lg" />
              {isOwnProfile && (
                <label
                  className="profile-avatar-edit-btn"
                  htmlFor="avatar-upload"
                  title="Change photo"
                >
                  {avatarUploading ? '…' : '✎'}
                </label>
              )}
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={avatarUploading}
                style={{ display: 'none' }}
              />
            </div>

            <div className="profile-header-info">
              <div className="profile-name-row">
                <h2>{user.name}</h2>
                <FavouriteAchievementBadges
                  favourites={favouriteAchievements}
                  className="profile-achievement-badges"
                />
              </div>
              {isOwnProfile && <p className="profile-header-email">{user.email}</p>}
              <div className="profile-header-badges">
                {memberSince && <span className="profile-badge">Member since {memberSince}</span>}
                {isOwnProfile && user.google_id && <span className="profile-badge profile-badge-google">Linked with Google</span>}
                {isOwnProfile && user.email_verified_at && (
                  <span className="profile-badge profile-badge-verified">Email verified</span>
                )}
              </div>
            </div>
          </div>
        </div>
        {avatarError && (
          <p className="msg-error" style={{ maxWidth: 420, margin: '0 auto 1.5rem' }}>{avatarError}</p>
        )}

        {/* Tabs */}
        <div className="profile-tabs">
          <button
            type="button"
            className={`profile-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          {isOwnProfile && (
            <button
              type="button"
              className={`profile-tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('settings');
                if (user) {
                  setName(user.name);
                  setEmail(user.email);
                }
              }}
            >
              Settings
            </button>
          )}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-card-value">{recentGems.length}</span>
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
              {isOwnProfile && (
                <div className="stat-card">
                  <span className="stat-card-value">{stats.totalTrips}</span>
                  <span className="stat-card-label">Trip Itineraries</span>
                </div>
              )}
              {isOwnProfile && (
                <div className="stat-card">
                  <span className="stat-card-value">{stats.totalPosts}</span>
                  <span className="stat-card-label">Stories</span>
                </div>
              )}
            </div>

            <div className="profile-recent-section">
              <div className="trip-detail-section-header">
                <h2>Hidden Gems</h2>
                {isOwnProfile && stats.totalGems > 0 && (
                  <Link to="/my-hidden-gems" className="home-trending-seeall">View all →</Link>
                )}
              </div>

              {isOwnProfile && statsLoading ? (
                <div className="page-loading-bar" role="progressbar" aria-label="Loading hidden gems">
                  <div className="page-loading-bar-indicator" />
                </div>
              ) : recentGems.length === 0 ? (
                <div className="hidden-gems-empty">
                  <p>{isOwnProfile ? "You haven't submitted any hidden gems yet." : "No hidden gems yet."}</p>
                  {isOwnProfile && (
                    <Link to="/hidden-gems/create" className="hidden-gems-submit-btn">
                      + Hidden Gem
                    </Link>
                  )}
                </div>
              ) : (
                <div className="hidden-gems-list profile-recent-list">
                  {recentGems.map((gem) => (
                    <div
                      key={gem.id}
                      className={`hidden-gems-card${gem.permanently_closed_at ? " gem-card-closed" : ""}`}
                      onClick={() => navigate(`/hidden-gems/${gem.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="hidden-gems-card-image">
                        <PhotoCarousel
                          images={gem.images || []}
                          alt={gem.place_name}
                          compact
                          fill
                          showThumbs={false}
                        />
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

            {isOwnProfile && (
              <div className="profile-recent-section">
                <div className="trip-detail-section-header">
                  <h2>Your Stories</h2>
                  {stats.totalPosts > 0 && (
                    <Link to="/travel-posts?mine=1" className="home-trending-seeall">View all →</Link>
                  )}
                </div>

                {statsLoading ? (
                  <div className="page-loading-bar" role="progressbar" aria-label="Loading your stories">
                    <div className="page-loading-bar-indicator" />
                  </div>
                ) : recentPosts.length === 0 ? (
                  <div className="hidden-gems-empty">
                    <p>You haven't written any travel posts yet.</p>
                    <Link to="/travel-posts/create" className="hidden-gems-submit-btn">
                      + Write a Post
                    </Link>
                  </div>
                ) : (
                  <div className="hidden-gems-list profile-recent-list">
                    {recentPosts.map((post) => (
                      <div
                        key={post.id}
                        className="hidden-gems-card"
                        onClick={() => navigate(`/travel-posts/${post.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="hidden-gems-card-image">
                          {post.cover_image_url || post.images?.[0]?.image_url ? (
                            <img
                              src={post.cover_image_url || post.images[0].image_url}
                              alt={post.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div className="hidden-gems-card-no-image">No Image</div>
                          )}
                        </div>
                        <div className="hidden-gems-card-content">
                          <h2>{post.title}</h2>
                          <p className="hidden-gems-card-description">
                            {post.body?.length > 120 ? `${post.body.slice(0, 120)}…` : post.body}
                          </p>
                          <div className="hidden-gems-card-tags">
                            <span className="hidden-gems-card-state">
                              {new Date(post.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {post.locations?.length > 0 && (
                              <span className="hidden-gems-card-category">
                                {post.locations.length} gem{post.locations.length > 1 ? 's' : ''} tagged
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Settings (only for own profile) */}
        {isOwnProfile && activeTab === 'settings' && (
          <>
            <div className="section-card">
              <h3>Profile Information</h3>
              <form onSubmit={handleProfileSubmit}>
                {profileMessage && <p className="msg-success">{profileMessage}</p>}
                {profileError && <p className="msg-error">{profileError}</p>}
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="form-input"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="form-input"
                />
                <button type="submit" className="btn btn-primary">Update Profile</button>
              </form>
            </div>

            <div className="section-card">
              <h3>{hasPassword ? 'Change Password' : 'Set Password'}</h3>
              <form onSubmit={handlePasswordSubmit}>
                {passwordMessage && <p className="msg-success">{passwordMessage}</p>}
                {passwordError && <p className="msg-error">{passwordError}</p>}

                {hasPassword && (
                  <div className="form-input-wrapper">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      placeholder="Current Password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="form-input"
                    />
                    <button
                      type="button"
                      className="form-input-toggle"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                    >
                      {showCurrentPassword ? <MdVisibility size={18} /> : <MdVisibilityOff size={18} />}
                    </button>
                  </div>
                )}

                <div className="form-input-wrapper">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="form-input"
                  />
                  <button
                    type="button"
                    className="form-input-toggle"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <MdVisibility size={18} /> : <MdVisibilityOff size={18} />}
                  </button>
                </div>

                {newPassword && (
                  <div className="password-strength">
                    <div className="password-strength-bar">
                      <span className={`password-strength-seg ${newPasswordStrength.level >= 1 ? `filled level-${newPasswordStrength.level}` : ''}`} />
                      <span className={`password-strength-seg ${newPasswordStrength.level >= 2 ? `filled level-${newPasswordStrength.level}` : ''}`} />
                      <span className={`password-strength-seg ${newPasswordStrength.level >= 3 ? `filled level-${newPasswordStrength.level}` : ''}`} />
                    </div>
                    <span className={`password-strength-label strength-${newPasswordStrength.level}`}>
                      {newPasswordStrength.label}
                    </span>
                  </div>
                )}
                <p className={`password-hint ${newPassword.length >= 8 ? 'password-hint-ok' : ''}`}>
                  {newPassword.length >= 8 ? '✓' : '•'} At least 8 characters
                </p>

                <div className="form-input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm New Password"
                    value={newPasswordConfirmation}
                    onChange={(e) => setNewPasswordConfirmation(e.target.value)}
                    required
                    className="form-input"
                  />
                  <button
                    type="button"
                    className="form-input-toggle"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <MdVisibility size={18} /> : <MdVisibilityOff size={18} />}
                  </button>
                </div>
                {newPasswordConfirmation && (
                  <p className={`password-hint ${newPassword === newPasswordConfirmation ? 'password-hint-ok' : 'password-hint-bad'}`}>
                    {newPassword === newPasswordConfirmation ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
                <button type="submit" className="btn btn-danger">
                  {hasPassword ? 'Change Password' : 'Set Password'}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Profile;
