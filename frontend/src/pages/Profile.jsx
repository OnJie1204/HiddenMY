import { useState, useEffect } from 'react';
import { getMe, updateProfile, changePassword } from '../api/auth';

function Profile({ setAppUser }) {
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
      setUser(res.data);
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
      setUser(res.data.user);
      setAppUser(res.data.user); // Add this line to synchronize the user state in App.jsx
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
      <h1 className="page-title">My Profile</h1>

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
        <h3>Change Password</h3>
        <form onSubmit={handlePasswordSubmit}>
          {passwordMessage && <p className="msg-success">{passwordMessage}</p>}
          {passwordError && <p className="msg-error">{passwordError}</p>}
          <input
            type="password"
            placeholder="Current Password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="form-input"
          />
          <input
            type="password"
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="form-input"
          />
          <input
            type="password"
            placeholder="Confirm New Password"
            value={newPasswordConfirmation}
            onChange={(e) => setNewPasswordConfirmation(e.target.value)}
            required
            className="form-input"
          />
          <button type="submit" className="btn btn-danger">Change Password</button>
        </form>
      </div>
    </div>
  );
}

export default Profile;