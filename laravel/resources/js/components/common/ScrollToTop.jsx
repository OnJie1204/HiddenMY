import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// React Router's client-side navigation doesn't reset scroll position the
// way a normal full-page load does — without this, navigating to a new page
// keeps whatever scroll offset the previous page was left at (e.g. landing
// on the bottom of Hidden Gems right after scrolling to the bottom of
// Travel Posts). Mounted once inside <BrowserRouter> so every route change
// scrolls back to the top.
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export default ScrollToTop;
