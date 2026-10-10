import ThemePopup from "@/dialogs/theme";
import SitesPopup from "@/dialogs/sites";
import SaveSitePopup from "@/dialogs/save-site";
import { DownloadsPopup } from "@/dialogs/downloads-popup";
import WebConnectionPopup from "@/dialogs/web-connection";
import type { RouteProps } from "@/@types/popup";
import { Route, Routes, useOutletContext } from "react-router";

function PopupApp() {
  const props = useOutletContext<RouteProps>();
  return (
    <Routes>
      <Route path="theme" element={<ThemePopup {...props} />} />
      <Route path="sites" element={<SitesPopup {...props} />} />
      <Route path="downloads" element={<DownloadsPopup {...props} />} />
      <Route path="save" element={<SaveSitePopup {...props} />} />
      <Route
        path="web-connection"
        element={<WebConnectionPopup {...props} />}
      />
    </Routes>
  );
}

export default PopupApp;
