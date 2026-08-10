import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/auth';

function Register({ onRegisterSuccess }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', password_confirmation: '',
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await register(form);
      navigate('/login', { state: { message: res.data.message } });
    } catch (err) {
      const errors = err.response?.data?.errors;
      setError(errors ? Object.values(errors).flat().join(', ') : 'Registration failed');
    }
  };

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-card">
        <h2>Create account</h2>
        <p className="subtitle">Join HiddenMY and start exploring</p>
        {error && <p className="msg-error">{error}</p>}
        <input name="name" placeholder="Name" onChange={handleChange} required className="form-input" />
        <input name="email" type="email" placeholder="Email" onChange={handleChange} required className="form-input" />
        <input name="password" type="password" placeholder="Password" onChange={handleChange} required className="form-input" />
        <input name="password_confirmation" type="password" placeholder="Confirm Password" onChange={handleChange} required className="form-input" />
        <button type="submit" className="btn btn-primary">Register</button>
        <p className="auth-link-row">Already have an account? <Link to="/login">Login</Link></p>
      </form>
    </div>
  );
}

export default Register;