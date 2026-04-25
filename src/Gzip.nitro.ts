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
}
