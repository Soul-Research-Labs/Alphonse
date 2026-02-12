import { createFileRoute } from '@tanstack/react-router';
import browser from 'webextension-polyfill';

export const Route = createFileRoute('/')({ component: App });

const isPopupView = window.location.pathname.endsWith('/popup.html');
const openDesktopView = () => {
  const desktopUrl = browser.runtime.getURL('desktop.html#/');
  window.open(desktopUrl, '_blank', 'noopener,noreferrer');
};

function App() {
  return (
    <div className="h-full w-full bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center px-6">
        <h1 className="text-5xl font-black text-white mb-4">ALPHONSE</h1>
        <p className="text-xl text-gray-400">Non-Custodial Wallet</p>
        {isPopupView ? (
          <button
            type="button"
            onClick={openDesktopView}
            className="mt-6 rounded-md border border-slate-500 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700">
            Open Desktop View
          </button>
        ) : null}
      </div>
    </div>
  );
}
