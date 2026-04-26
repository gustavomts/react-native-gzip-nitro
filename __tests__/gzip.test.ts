import { deflateSync as zlibDeflate, gunzipSync, gzipSync } from "zlib";

import { deflate, deflateBatch, inflate, inflateBatch } from "../src";

describe("react-native-nitro-gzip", () => {
    describe("deflate", () => {
        it("compresses an ASCII string and returns a base64-encoded gzip payload", async () => {
            const out = await deflate("Hello, world!");
            expect(typeof out).toBe("string");
            // base64 of a non-empty buffer never contains spaces.
            expect(out).toMatch(/^[A-Za-z0-9+/]+=*$/);

            // The bytes underneath must be a real gzip stream that Node can read.
            const bytes = Buffer.from(out, "base64");
            expect(bytes[0]).toBe(0x1f);
            expect(bytes[1]).toBe(0x8b);
            expect(gunzipSync(bytes).toString("utf8")).toBe("Hello, world!");
        });

        it("compresses an empty string into a valid (non-empty) gzip stream", async () => {
            const out = await deflate("");
            const bytes = Buffer.from(out, "base64");
            expect(bytes.length).toBeGreaterThan(0); // gzip header + empty payload
            expect(gunzipSync(bytes).toString("utf8")).toBe("");
        });

        it("handles UTF-8 multibyte characters", async () => {
            const text = "🚜 HeavyConnect — café 测试 αβγ";
            const out = await deflate(text);
            expect(gunzipSync(Buffer.from(out, "base64")).toString("utf8")).toBe(text);
        });

        it("compresses large repetitive input efficiently (>10x ratio)", async () => {
            const text = "ABCDEFGHIJ".repeat(10_000); // 100 KB of repeating bytes
            const out = await deflate(text);
            const compressedBytes = Buffer.from(out, "base64").length;
            expect(compressedBytes).toBeLessThan(text.length / 10);
            expect(gunzipSync(Buffer.from(out, "base64")).toString("utf8")).toBe(text);
        });
    });

    describe("inflate", () => {
        it("decompresses a gzip-framed, base64-encoded payload", async () => {
            const payload = gzipSync(Buffer.from("Hello, world!", "utf8")).toString("base64");
            await expect(inflate(payload)).resolves.toBe("Hello, world!");
        });

        it("auto-detects zlib framing in addition to gzip", async () => {
            const payload = zlibDeflate(Buffer.from("zlib framed", "utf8")).toString("base64");
            await expect(inflate(payload)).resolves.toBe("zlib framed");
        });

        it("preserves UTF-8 multibyte characters through a round trip", async () => {
            const text = "🚜 HeavyConnect — café 测试 αβγ";
            const compressed = await deflate(text);
            await expect(inflate(compressed)).resolves.toBe(text);
        });

        it("handles base64 with embedded whitespace/newlines", async () => {
            const raw = gzipSync(Buffer.from("padded with newlines", "utf8")).toString("base64");
            // PEM-style line breaks every 16 chars
            const padded = raw.match(/.{1,16}/g)!.join("\n");
            await expect(inflate(padded)).resolves.toBe("padded with newlines");
        });

        it("rejects on invalid base64 input", async () => {
            await expect(inflate("!!!not-base64!!!")).rejects.toThrow(/base64/i);
        });

        it("rejects on a corrupted gzip stream", async () => {
            const ok = gzipSync(Buffer.from("payload", "utf8"));
            // Flip a bit deep in the deflate stream to invalidate it.
            const tampered = Buffer.from(ok);
            tampered[tampered.length - 5] ^= 0xff;
            await expect(inflate(tampered.toString("base64"))).rejects.toThrow(/zlib|inflate/i);
        });
    });

    describe("batch", () => {
        it("deflateBatch + inflateBatch round-trips and preserves order", async () => {
            const inputs = [
                "",
                "hello",
                "🚜 HeavyConnect — café 测试 αβγ",
                JSON.stringify({ a: 1, b: [1, 2, 3] }),
                "abcdef".repeat(20_000),
            ];
            const compressed = await deflateBatch(inputs);
            expect(compressed).toHaveLength(inputs.length);
            const out = await inflateBatch(compressed);
            expect(out).toEqual(inputs);
        });

        it("returns an empty array for an empty batch", async () => {
            await expect(deflateBatch([])).resolves.toEqual([]);
            await expect(inflateBatch([])).resolves.toEqual([]);
        });

        it("inflateBatch matches per-item inflate output", async () => {
            const payloads = ["one", "two", "three"].map((s) =>
                gzipSync(Buffer.from(s, "utf8")).toString("base64"),
            );
            const batch = await inflateBatch(payloads);
            const single = await Promise.all(payloads.map((p) => inflate(p)));
            expect(batch).toEqual(single);
        });

        it("inflateBatch rejects when any item is invalid (fail-fast)", async () => {
            const good = gzipSync(Buffer.from("ok", "utf8")).toString("base64");
            await expect(inflateBatch([good, "!!!not-base64!!!", good])).rejects.toThrow(/base64/i);
        });
    });

    describe("round trip", () => {
        it.each([
            ["empty", ""],
            ["short ASCII", "hello"],
            ["JSON-ish", JSON.stringify({ a: 1, b: [1, 2, 3], c: "hi" })],
            ["unicode", "🚜🌽 café 测试 αβγ"],
            ["1 KB random-ish text", Array.from({ length: 1024 }, (_, i) => String.fromCharCode(33 + (i % 90))).join("")],
            ["100 KB repeated", "abcdef".repeat(20_000)],
        ])("deflate -> inflate is identity for %s", async (_label, input) => {
            const compressed = await deflate(input);
            const out = await inflate(compressed);
            expect(out).toBe(input);
        });
    });
});
