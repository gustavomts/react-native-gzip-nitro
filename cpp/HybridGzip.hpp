#pragma once

#include "HybridGzipSpec.hpp"

namespace margelo::nitro::nitrogzip {

class HybridGzip final : public HybridGzipSpec {
public:
    HybridGzip() : HybridObject(TAG) {}

    std::shared_ptr<Promise<std::string>> inflate(const std::string& base64) override;
    std::shared_ptr<Promise<std::string>> deflate(const std::string& data) override;
};

} // namespace margelo::nitro::nitrogzip
