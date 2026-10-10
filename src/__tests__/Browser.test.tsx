import "@testing-library/jest-dom";
// eslint-disable-next-line import/named -- reexported from @testing-library/dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useOutletContext } from "react-router";
import BrowserApp from "../renderer/components/browser/Browser";
import { useBrowser } from "../renderer/hooks/use-browser";
import type { BrowserState } from "../shared/browser";

jest.mock("react-router", () => ({ useOutletContext: jest.fn() }));

const state: BrowserState = {
  downloads: [],
  downloadDirectory: "",
  downloadDirectoryManaged: false,
  tabs: [
    {
      id: "1",
      title: "Nova aba",
      url: "",
      loading: false,
      error: "",
      savedTitle: "",
    },
  ],
  activeTabId: "1",
  canGoBack: false,
  canGoForward: false,
  maximized: false,
  savedUrls: [],
  theme: "light",
  popup: null,
  webConnection: {
    autoStart: false,
    controlExternal: true,
    executablePath: "",
    port: 9098,
    status: "stopped",
    error: "",
  },
};

test("navega pela barra de endereço e abre nova aba", async () => {
  const command = jest.fn().mockResolvedValue(undefined);
  window.electron = {
    browser: {
      getState: jest.fn().mockResolvedValue({ revision: 1, state }),
      command,
      resizePopup: jest.fn().mockResolvedValue(undefined),
      onState: jest.fn().mockReturnValue(() => {}),
    },
  };

  function BrowserUnderTest() {
    const browser = useBrowser({ state, error: "" });
    (useOutletContext as jest.Mock).mockReturnValue(browser);
    return <BrowserApp />;
  }

  render(<BrowserUnderTest />);
  await screen.findByRole("button", { name: "Fechar Nova aba" });
  fireEvent.change(screen.getByRole("textbox", { name: "URL do Sankhya" }), {
    target: { value: "example.com" },
  });
  fireEvent.submit(
    screen.getByRole("textbox", { name: "URL do Sankhya" }).closest("form")!,
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Nova aba" }).at(-1)!);

  await waitFor(() => {
    expect(command).toHaveBeenCalledWith({
      type: "navigate",
      url: "example.com",
    });
    expect(command).toHaveBeenCalledWith({ type: "new-tab" });
  });
});
