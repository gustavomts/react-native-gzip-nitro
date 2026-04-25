import { NitroModules } from "react-native-nitro-modules";

import type { Gzip as GzipSpec } from "./Gzip.nitro";

const Gzip = NitroModules.createHybridObject<GzipSpec>("Gzip");

/**
 * Decompress a gzip-compressed, base64-encoded payload into a UTF-8 string.
 */
export function inflate(base64: string): Promise<string> {
    return Gzip.inflate(base64);
}

/**
 * Gzip-compress a UTF-8 string and return a base64-encoded string.
 */
export function deflate(data: string): Promise<string> {
    return Gzip.deflate(data);
}
