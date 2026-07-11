import Navbar from './Navbar';
import Footer from './Footer';

function Layout({ children, user, setUser }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar user={user} setUser={setUser} />
      <main style={{ flex: 1, padding: '2rem' }}>{children}</main>
      <Footer />
    </div>
  );
}

export default Layout;