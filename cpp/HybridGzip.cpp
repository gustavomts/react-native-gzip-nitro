#include "HybridGzip.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <cstdint>
#include <exception>
#include <future>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
#include <zlib.h>

namespace margelo::nitro::nitrogzip {

namespace {

constexpr char kBase64Alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string base64Encode(const uint8_t* data, size_t len) {
    std::string out;
    out.reserve(((len + 2) / 3) * 4);

    size_t i = 0;
    while (i + 3 <= len) {
        uint32_t triple = (uint32_t(data[i]) << 16) | (uint32_t(data[i + 1]) << 8) | uint32_t(data[i + 2]);
        out.push_back(kBase64Alphabet[(triple >> 18) & 0x3F]);
        out.push_back(kBase64Alphabet[(triple >> 12) & 0x3F]);
        out.push_back(kBase64Alphabet[(triple >> 6) & 0x3F]);
        out.push_back(kBase64Alphabet[triple & 0x3F]);
        i += 3;
    }

    const size_t remaining = len - i;
    if (remaining == 1) {
        uint32_t triple = uint32_t(data[i]) << 16;
        out.push_back(kBase64Alphabet[(triple >> 18) & 0x3F]);
        out.push_back(kBase64Alphabet[(triple >> 12) & 0x3F]);
        out.push_back('=');
        out.push_back('=');
    } else if (remaining == 2) {
        uint32_t triple = (uint32_t(data[i]) << 16) | (uint32_t(data[i + 1]) << 8);
        out.push_back(kBase64Alphabet[(triple >> 18) & 0x3F]);
        out.push_back(kBase64Alphabet[(triple >> 12) & 0x3F]);
        out.push_back(kBase64Alphabet[(triple >> 6) & 0x3F]);
        out.push_back('=');
    }

    return out;
}

std::vector<uint8_t> base64Decode(const std::string& input) {
    static constexpr auto buildTable = []() {
        std::array<int8_t, 256> t{};
        for (auto& v : t) v = -1;
        for (int i = 0; i < 64; ++i) t[static_cast<uint8_t>(kBase64Alphabet[i])] = static_cast<int8_t>(i);
        return t;
    };
    static const auto table = buildTable();

    std::vector<uint8_t> out;
    out.reserve((input.size() / 4) * 3);

    uint32_t buffer = 0;
    int bits = 0;
    for (char c : input) {
        if (c == '=' || c == '\0') break;
        if (c == '\n' || c == '\r' || c == ' ' || c == '\t') continue;
        int8_t v = table[static_cast<uint8_t>(c)];
        if (v < 0) throw std::invalid_argument("Invalid base64 character");
        buffer = (buffer << 6) | static_cast<uint32_t>(v);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push_back(static_cast<uint8_t>((buffer >> bits) & 0xFF));
        }
    }
    return out;
}

std::string gzipInflate(const std::vector<uint8_t>& compressed) {
    if (compressed.empty()) return {};

    z_stream stream{};
    // 15 + 32 enables automatic detection of gzip and zlib headers.
    if (inflateInit2(&stream, 15 + 32) != Z_OK) {
        throw std::runtime_error("zlib: inflateInit2 failed");
    }

    stream.next_in = const_cast<Bytef*>(compressed.data());
    stream.avail_in = static_cast<uInt>(compressed.size());

    std::string out;
    constexpr size_t kChunk = 32 * 1024;
    std::vector<uint8_t> buffer(kChunk);

    int status = Z_OK;
    do {
        stream.next_out = buffer.data();
        stream.avail_out = static_cast<uInt>(buffer.size());
        status = ::inflate(&stream, Z_NO_FLUSH);
        if (status == Z_NEED_DICT || status == Z_DATA_ERROR || status == Z_MEM_ERROR) {
            inflateEnd(&stream);
            throw std::runtime_error(std::string("zlib: inflate failed: ") + (stream.msg ? stream.msg : "unknown"));
        }
        out.append(reinterpret_cast<char*>(buffer.data()), buffer.size() - stream.avail_out);
    } while (status != Z_STREAM_END && stream.avail_out == 0);

    inflateEnd(&stream);
    if (status != Z_STREAM_END) {
        throw std::runtime_error("zlib: truncated gzip stream");
    }
    return out;
}

std::vector<uint8_t> gzipDeflate(const std::string& input) {
    z_stream stream{};
    // 15 + 16 => gzip wrapping (matches react-native-gzip output).
    if (deflateInit2(&stream, Z_DEFAULT_COMPRESSION, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY) != Z_OK) {
        throw std::runtime_error("zlib: deflateInit2 failed");
    }

    stream.next_in = reinterpret_cast<Bytef*>(const_cast<char*>(input.data()));
    stream.avail_in = static_cast<uInt>(input.size());

    std::vector<uint8_t> out;
    constexpr size_t kChunk = 32 * 1024;
    std::vector<uint8_t> buffer(kChunk);

    int status = Z_OK;
    do {
        stream.next_out = buffer.data();
        stream.avail_out = static_cast<uInt>(buffer.size());
        status = ::deflate(&stream, Z_FINISH);
        if (status == Z_STREAM_ERROR) {
            deflateEnd(&stream);
            throw std::runtime_error("zlib: deflate failed");
        }
        out.insert(out.end(), buffer.data(), buffer.data() + (buffer.size() - stream.avail_out));
    } while (status != Z_STREAM_END);

    deflateEnd(&stream);
    return out;
}

std::string inflateOne(const std::string& base64) {
    auto compressed = base64Decode(base64);
    return gzipInflate(compressed);
}

std::string deflateOne(const std::string& data) {
    auto compressed = gzipDeflate(data);
    return base64Encode(compressed.data(), compressed.size());
}

template <typename Fn>
std::vector<std::string> runBatchParallel(const std::vector<std::string>& items, Fn&& fn) {
    const size_t n = items.size();
    std::vector<std::string> results(n);
    if (n == 0) return results;
    if (n == 1) {
        results[0] = fn(items[0]);
        return results;
    }

    // Cap concurrency to avoid spawning a thread per item on huge batches.
    unsigned int hw = std::thread::hardware_concurrency();
    if (hw == 0) hw = 4;
    const size_t maxWorkers = std::min<size_t>(n, hw);

    std::vector<std::future<void>> futures;
    futures.reserve(maxWorkers);

    std::atomic<size_t> next{0};
    for (size_t w = 0; w < maxWorkers; ++w) {
        futures.emplace_back(std::async(std::launch::async, [&]() {
            for (;;) {
                size_t i = next.fetch_add(1, std::memory_order_relaxed);
                if (i >= n) return;
                results[i] = fn(items[i]);
            }
        }));
    }

    // Re-throw the first exception encountered, if any (fail-fast for the batch).
    std::exception_ptr firstError;
    for (auto& f : futures) {
        try {
            f.get();
        } catch (...) {
            if (!firstError) firstError = std::current_exception();
        }
    }
    if (firstError) std::rethrow_exception(firstError);
    return results;
}

} // namespace

std::shared_ptr<Promise<std::string>> HybridGzip::inflate(const std::string& base64) {
    return Promise<std::string>::async([base64]() -> std::string {
        return inflateOne(base64);
    });
}

std::shared_ptr<Promise<std::string>> HybridGzip::deflate(const std::string& data) {
    return Promise<std::string>::async([data]() -> std::string {
        return deflateOne(data);
    });
}

std::shared_ptr<Promise<std::vector<std::string>>> HybridGzip::inflateBatch(const std::vector<std::string>& items) {
    return Promise<std::vector<std::string>>::async([items]() -> std::vector<std::string> {
        return runBatchParallel(items, [](const std::string& s) { return inflateOne(s); });
    });
}

std::shared_ptr<Promise<std::vector<std::string>>> HybridGzip::deflateBatch(const std::vector<std::string>& items) {
    return Promise<std::vector<std::string>>::async([items]() -> std::vector<std::string> {
        return runBatchParallel(items, [](const std::string& s) { return deflateOne(s); });
    });
}

} // namespace margelo::nitro::nitrogzip
