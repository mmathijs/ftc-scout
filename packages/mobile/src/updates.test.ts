import { AppState } from "react-native";

const mockUpdates = {
    isEnabled: true,
    checkForUpdateAsync: jest.fn(),
    fetchUpdateAsync: jest.fn(),
    reloadAsync: jest.fn(),
    useUpdates: jest.fn(() => ({ isUpdatePending: false })),
};
jest.mock("expo-updates", () => mockUpdates);

type Module = typeof import("./updates");

// A fresh copy each time, since the module remembers checks and downloads.
function load(): Module {
    let m!: Module;
    jest.isolateModules(() => {
        m = require("./updates");
    });
    return m;
}

const dev = (globalThis as any).__DEV__;

beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).__DEV__ = false;
    mockUpdates.isEnabled = true;
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true });
    mockUpdates.reloadAsync.mockResolvedValue(undefined);
    mockUpdates.useUpdates.mockReturnValue({ isUpdatePending: false });
});

afterAll(() => {
    (globalThis as any).__DEV__ = dev;
});

describe("fetchUpdate", () => {
    it("downloads a new update", async () => {
        await expect(load().fetchUpdate()).resolves.toBe(true);
        expect(mockUpdates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    });

    it("downloads nothing when there's no update", async () => {
        mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
        await expect(load().fetchUpdate()).resolves.toBe(false);
        expect(mockUpdates.fetchUpdateAsync).not.toHaveBeenCalled();
    });

    it("checks once at a time and not again once one is downloaded", async () => {
        let m = load();
        await Promise.all([m.fetchUpdate(), m.fetchUpdate()]);
        await m.fetchUpdate();
        expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    });

    it("tries again next time when the check fails", async () => {
        let m = load();
        mockUpdates.checkForUpdateAsync.mockRejectedValueOnce(new Error("offline"));
        await expect(m.fetchUpdate()).resolves.toBe(false);
        await expect(m.fetchUpdate()).resolves.toBe(true);
    });

    it("does nothing in development or without updates", async () => {
        (globalThis as any).__DEV__ = true;
        await expect(load().fetchUpdate()).resolves.toBe(false);
        (globalThis as any).__DEV__ = false;
        mockUpdates.isEnabled = false;
        await expect(load().fetchUpdate()).resolves.toBe(false);
        expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
    });
});

describe("wireUpdates", () => {
    it("looks again when the app comes to the front, at most every RECHECK_MS", () => {
        let listen = jest.spyOn(AppState, "addEventListener");
        let now = jest.spyOn(Date, "now").mockReturnValue(0);
        let m = load();
        m.wireUpdates();
        let onChange = listen.mock.calls[0][1] as (s: string) => void;

        now.mockReturnValue(m.RECHECK_MS - 1);
        onChange("active");
        expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();

        now.mockReturnValue(m.RECHECK_MS);
        onChange("background");
        expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
        onChange("active");
        expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
        now.mockRestore();
        listen.mockRestore();
    });
});

describe("useRefreshWithUpdate", () => {
    it("restarts into an update that is waiting instead of refreshing", async () => {
        mockUpdates.useUpdates.mockReturnValue({ isUpdatePending: true });
        let refetch = jest.fn(async () => {});
        await load().useRefreshWithUpdate(refetch)();
        expect(mockUpdates.reloadAsync).toHaveBeenCalled();
        expect(refetch).not.toHaveBeenCalled();
    });

    it("refreshes and looks for an update when none is waiting", async () => {
        let refetch = jest.fn(async () => {});
        await load().useRefreshWithUpdate(refetch)();
        expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
        expect(refetch).toHaveBeenCalled();
        expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalled();
    });

    it("refreshes as usual when restarting fails", async () => {
        mockUpdates.useUpdates.mockReturnValue({ isUpdatePending: true });
        mockUpdates.reloadAsync.mockRejectedValue(new Error("no"));
        let refetch = jest.fn(async () => {});
        await load().useRefreshWithUpdate(refetch)();
        expect(refetch).toHaveBeenCalled();
    });
});
