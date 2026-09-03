import { useState } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import SidePanel from './SidePanel';
import BackButton from './BackButton';

function Layout({ children, user, setUser }) {
    const [sidePanelOpen, setSidePanelOpen] = useState(false);
    const [sidePanelGroup, setSidePanelGroup] = useState(null);

    const openSidePanel = (group) => {
        setSidePanelGroup(group);
        setSidePanelOpen(true);
    };

    const closeSidePanel = () => {
        setSidePanelOpen(false);
        setSidePanelGroup(null);
    };

    const toggleSidePanel = () => {
        setSidePanelOpen(!sidePanelOpen);

        if (sidePanelOpen) {
            setSidePanelGroup(null);
        }
    };

    return (
        <div className="layout">
            <Navbar
                user={user}
                setUser={setUser}
                onMenuClick={toggleSidePanel}
            />

            <SidePanel
                group={sidePanelGroup}
                isOpen={sidePanelOpen}
                onClose={closeSidePanel}
                user={user}
                setUser={setUser}
            />

            <main className="layout-main">
                <BackButton />
                {children}
            </main>

            <Footer />
        </div>
    );
}

export default Layout;