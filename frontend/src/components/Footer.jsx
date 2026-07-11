function Footer() {
  return (
    <footer style={styles.footer}>
      <p>&copy; {new Date().getFullYear()} Gemora. All rights reserved.</p>
    </footer>
  );
}

const styles = {
  footer: {
    textAlign: 'center',
    padding: '1rem',
    background: '#1e293b',
    color: '#94a3b8',
    marginTop: 'auto',
  },
};

export default Footer;