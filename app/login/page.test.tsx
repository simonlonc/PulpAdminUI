// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";

const { listBackendsMock, loginMock } = vi.hoisted(() => ({
  listBackendsMock: vi.fn(),
  loginMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/pulp/auth-context", () => ({
  usePulpAuthContext: () => ({
    sessionUser: null,
    isLoading: false,
    isCheckingSession: false,
    error: null,
    login: loginMock,
  }),
}));
vi.mock("@/services/pulp/auth-service", () => ({
  pulpAuthService: { listBackends: listBackendsMock },
}));

const ALPHA = { id: "a", label: "Alpha" };
const BRAVO = { id: "b", label: "Bravo" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Renders the page and lets the server list arrive. */
async function renderPage(backends: { id: string; label: string }[]) {
  listBackendsMock.mockResolvedValue(backends);
  loginMock.mockResolvedValue(false);
  render(<LoginPage />);
  await act(async () => {
    await listBackendsMock.mock.results[0].value;
  });
}

async function signIn() {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  });
}

describe("LoginPage", () => {
  it.each([
    ["no server list", []],
    ["a single server", [ALPHA]],
  ])("shows no server field and sends no backendId with %s", async (_name, backends) => {
    await renderPage(backends);

    expect(screen.queryByLabelText("Pulp server")).toBeNull();
    await signIn();

    expect(loginMock).toHaveBeenCalledWith("admin", "pw", undefined);
  });

  it("offers every server above the username and preselects the first", async () => {
    await renderPage([ALPHA, BRAVO]);

    const select = screen.getByLabelText("Pulp server") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(["Alpha", "Bravo"]);
    expect(select.value).toBe("a");
    expect(
      select.compareDocumentPosition(screen.getByLabelText("Username")) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await signIn();

    expect(loginMock).toHaveBeenCalledWith("admin", "pw", "a");
  });

  it("signs in to the server the user picked", async () => {
    await renderPage([ALPHA, BRAVO]);

    fireEvent.change(screen.getByLabelText("Pulp server"), { target: { value: "b" } });
    await signIn();

    expect(loginMock).toHaveBeenCalledWith("admin", "pw", "b");
  });
});
