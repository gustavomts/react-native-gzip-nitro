import type { HybridObject } from "react-native-nitro-modules";

export interface Gzip extends HybridObject<{ ios: "c++"; android: "c++" }> {
    /**
     * Decompress a gzip-compressed, base64-encoded payload into a UTF-8 string.
     * Runs on a background thread.
     */
    inflate(base64: string): Promise<string>;

    /**
     * Gzip-compress a UTF-8 string and return a base64-encoded string.
     * Runs on a background thread.
     */
    deflate(data: string): Promise<string>;

    /**
     * Decompress an array of gzip-compressed, base64-encoded payloads in parallel
     * across native worker threads. Resolves with results in the same order as the
     * input. If any item fails, the whole batch rejects (fail-fast).
     */
    inflateBatch(items: string[]): Promise<string[]>;

    /**
     * Gzip-compress an array of UTF-8 strings in parallel across native worker
     * threads, returning base64-encoded outputs in the same order. If any item
     * fails, the whole batch rejects (fail-fast).
     */
    deflateBatch(items: string[]): Promise<string[]>;
}
