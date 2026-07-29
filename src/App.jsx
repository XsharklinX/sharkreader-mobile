import React, { useState } from 'react';
import TabBar from './ui/TabBar.jsx';
import LibraryScreen from './screens/LibraryScreen.jsx';
import ProgressScreen from './screens/ProgressScreen.jsx';
import AchievementsScreen from './screens/AchievementsScreen.jsx';
import WorkshopScreen from './screens/WorkshopScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';

const SCREENS = {
    library: LibraryScreen,
    progress: ProgressScreen,
    achievements: AchievementsScreen,
    workshop: WorkshopScreen,
    settings: SettingsScreen,
};

export default function App() {
    const [tab, setTab] = useState('library');
    const Screen = SCREENS[tab];

    return (
        <div className="app">
            <main className="app-main">
                <Screen />
            </main>
            <TabBar active={tab} onChange={setTab} />
        </div>
    );
}
