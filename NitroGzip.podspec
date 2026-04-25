require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NitroGzip"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/gustavomts/react-native-gzip-nitro"
  s.license      = { :type => "MIT", :file => "LICENSE" }
  s.author       = { "Gustavo Aires" => "gustavoairesmatos@gmail.com" }

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/gustavomts/react-native-gzip-nitro.git", :tag => "#{s.version}" }

  s.source_files = [
    "ios/**/*.{h,m,mm,cpp}",
    "cpp/**/*.{h,hpp,cpp}",
  ]

  s.libraries = "z"

  load "nitrogen/generated/ios/NitroGzip+autolinking.rb"
  add_nitrogen_files(s)

  s.dependency "React-jsi"
  s.dependency "React-callinvoker"
  install_modules_dependencies(s)
end
