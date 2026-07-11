import { useState, useEffect } from 'react';
import { getMe, updateProfile, changePassword } from '../api/auth';

function Profile() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    getMe().then(res => {
      setUser(res.data.user);
      setName(res.data.name);
      setEmail(res.data.email);
    });
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileMessage('');
    try {
      const res = await updateProfile({ name, email });
      setUser(res.data);
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
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: newPasswordConfirmation,
      });
      setPasswordMessage('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirmation('');
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Password change failed');
    }
  };

  if (!user) return <p>Loading...</p>;

  return (
    <div>
      <h1>My Profile</h1>

      <form onSubmit={handleProfileSubmit} style={{ maxWidth: 300, marginBottom: '2rem' }}>
        <h3>Profile Information</h3>
        {profileMessage && <p style={{ color: 'green' }}>{profileMessage}</p>}
        {profileError && <p style={{ color: 'red' }}>{profileError}</p>}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ display: 'block', marginBottom: 10, width: '100%' }}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ display: 'block', marginBottom: 10, width: '100%' }}
        />
        <button type="submit">Update Profile</button>
      </form>

      <form onSubmit={handlePasswordSubmit} style={{ maxWidth: 300 }}>
        <h3>Change Password</h3>
        {passwordMessage && <p style={{ color: 'green' }}>{passwordMessage}</p>}
        {passwordError && <p style={{ color: 'red' }}>{passwordError}</p>}
        <input
          type="password"
          placeholder="Current Password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          style={{ display: 'block', marginBottom: 10, width: '100%' }}
        />
        <input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          style={{ display: 'block', marginBottom: 10, width: '100%' }}
        />
        <input
          type="password"
          placeholder="Confirm New Password"
          value={newPasswordConfirmation}
          onChange={(e) => setNewPasswordConfirmation(e.target.value)}
          required
          style={{ display: 'block', marginBottom: 10, width: '100%' }}
        />
        <button type="submit">Change Password</button>
      </form>
    </div>
  );
}

export default Profile;