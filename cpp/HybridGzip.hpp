#pragma once

#include <string>
#include <vector>

#include "HybridGzipSpec.hpp"

namespace margelo::nitro::nitrogzip {

class HybridGzip final : public HybridGzipSpec {
public:
    HybridGzip() : HybridObject(TAG) {}

    std::shared_ptr<Promise<std::string>> inflate(const std::string& base64) override;
    std::shared_ptr<Promise<std::string>> deflate(const std::string& data) override;
    std::shared_ptr<Promise<std::vector<std::string>>> inflateBatch(const std::vector<std::string>& items) override;
    std::shared_ptr<Promise<std::vector<std::string>>> deflateBatch(const std::vector<std::string>& items) override;
};

} // namespace margelo::nitro::nitrogzip
