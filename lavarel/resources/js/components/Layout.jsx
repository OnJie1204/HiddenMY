import Navbar from './Navbar';
import Footer from './Footer';

function Layout({ children, user, setUser }) {
  return (
    <div className="layout">
      <Navbar user={user} setUser={setUser} />
      <main className="layout-main">{children}</main>
      <Footer />
    </div>
  );
}

export default Layout;