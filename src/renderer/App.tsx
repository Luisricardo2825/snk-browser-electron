import '@/globals.css';

import type { BrowserCommand, BrowserState } from '@shared/browser';

import { HashRouter, Route, Routes } from 'react-router';
import BrowserApp from '@/components/browser/Browser';
import { DownloadsPopup } from '@/dialogs/downloads-popup';
import { useBrowser } from '@/hooks/use-browser';
import ThemePopup from '@/dialogs/theme';
import SitesPopup from '@/dialogs/sites';
import SaveSitePopup from '@/dialogs/save-site';
import { PopupProps } from '@/@types/popup';

function PopupApp(props: {
  state: BrowserState;
  error: string;
  run: (command: BrowserCommand) => Promise<void>;
}) {
  return (
    <Routes>
      <Route path="theme" element={<ThemePopup {...props} />} />
      <Route path="sites" element={<SitesPopup {...props} />} />
      <Route path="downloads" element={<DownloadsPopup {...props} />} />
      <Route path="save" element={<SaveSitePopup {...props} />} />
    </Routes>
  );
}

export default function App() {
  const browserProps = useBrowser();
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<BrowserApp {...browserProps} />} />
        <Route
          path="/popup/*"
          element={
            browserProps.state ? (
              <PopupApp {...(browserProps as PopupProps)} />
            ) : null
          }
        />
      </Routes>
    </HashRouter>
  );
}
