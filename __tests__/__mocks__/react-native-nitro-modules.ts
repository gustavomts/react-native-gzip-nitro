import { gunzipSync, gzipSync, inflateSync as zlibInflateSync } from "zlib";

/**
 * Node-side mock for `react-native-nitro-modules`.
 *
 * The real native HybridGzip lives in cpp/HybridGzip.cpp and does:
 *   - base64 decode -> zlib inflate (auto-detect gzip/zlib framing)
 *   - zlib gzip-compress -> base64 encode
 *
 * This mock implements the same contract using Node's `zlib` so the public
 * JS API can be exercised by Jest without a real device.
 */
function createGzipHybrid() {
    const hybrid = {
        async inflate(base64: string): Promise<string> {
            // Strip whitespace just like the C++ base64 decoder does.
            const cleaned = base64.replace(/[\s]/g, "");
            if (cleaned.length === 0) return "";

            let buf: Buffer;
            try {
                buf = Buffer.from(cleaned, "base64");
            } catch {
                throw new Error("Invalid base64 character");
            }
            // Node's `Buffer.from(..., "base64")` is lenient — it silently drops
            // unknown characters. Re-encode and compare to catch invalid input,
            // matching the strict behavior of the C++ implementation.
            const reencoded = buf.toString("base64").replace(/=+$/g, "");
            const expected = cleaned.replace(/=+$/g, "");
            if (reencoded !== expected) {
                throw new Error("Invalid base64 character");
            }

            // Auto-detect gzip vs zlib (15+32 window-bit trick).
            try {
                if (buf[0] === 0x1f && buf[1] === 0x8b) {
                    return gunzipSync(buf).toString("utf8");
                }
                return zlibInflateSync(buf).toString("utf8");
            } catch (err) {
                const msg = (err as Error).message || "unknown";
                throw new Error(`zlib: inflate failed: ${msg}`);
            }
        },

        async deflate(data: string): Promise<string> {
            const compressed = gzipSync(Buffer.from(data, "utf8"));
            return compressed.toString("base64");
        },

        async inflateBatch(items: string[]): Promise<string[]> {
            // Mirror the C++ behavior: process all items, fail-fast on first error.
            return Promise.all(items.map((item) => hybrid.inflate(item)));
        },

        async deflateBatch(items: string[]): Promise<string[]> {
            return Promise.all(items.map((item) => hybrid.deflate(item)));
        },
    };
    return hybrid;
}

export const NitroModules = {
    createHybridObject<T>(name: string): T {
        if (name !== "Gzip") {
            throw new Error(`Unexpected hybrid object name: ${name}`);
        }
        return createGzipHybrid() as unknown as T;
    },
};
