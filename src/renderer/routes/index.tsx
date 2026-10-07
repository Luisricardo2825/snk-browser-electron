import { createHashRouter, Outlet, useLoaderData } from 'react-router';
import BrowserApp from '@/components/browser/Browser';
import { useBrowser } from '@/hooks/use-browser';
import PopupApp from '@/routes/Popup';
import { browserLoader } from '@/routes/browser-loader';
function BrowserRoute() {
  const initial = useLoaderData<typeof browserLoader>();
  const browser = useBrowser(initial);
  return <Outlet context={browser} />;
}

export const router = createHashRouter([
  {
    path: '/',
    loader: browserLoader,
    Component: BrowserRoute,
    children: [
      { index: true, Component: BrowserApp },
      { path: 'popup/*', Component: PopupApp },
    ],
  },
]);
