import { onlineManager } from "@tanstack/react-query";
import { ApiError, RefusalError, TimeoutError } from "./client";
import { retryQuery } from "./queryClient";

describe("retryQuery", () => {
    beforeEach(() => onlineManager.setOnline(true));

    it("retries what may answer next time: a server failure, a timeout, a 408", () => {
        expect(retryQuery(0, new ApiError("", 502))).toBe(true);
        expect(retryQuery(1, new ApiError("", 502))).toBe(true);
        expect(retryQuery(2, new ApiError("", 502))).toBe(false);
        expect(retryQuery(0, new TypeError("Network request failed"))).toBe(true);
        expect(retryQuery(0, new TimeoutError(""))).toBe(true);
        expect(retryQuery(1, new TimeoutError(""))).toBe(false);
        expect(retryQuery(0, new ApiError("", 408))).toBe(true);
    });

    it("does not retry what the server turned down", () => {
        for (let e of [new RefusalError("", 400), new ApiError("", 403), new ApiError("", 429)]) {
            expect(retryQuery(0, e)).toBe(false);
        }
    });

    it("does not retry while offline", () => {
        onlineManager.setOnline(false);
        expect(retryQuery(0, new ApiError("", 502))).toBe(false);
    });
});
