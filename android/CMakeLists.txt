project(NitroGzip)
cmake_minimum_required(VERSION 3.9.0)

set(PACKAGE_NAME NitroGzip)
set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 20)

file(GLOB_RECURSE shared_files RELATIVE ${CMAKE_SOURCE_DIR}
     "../cpp/**.cpp"
)
file(GLOB_RECURSE android_files RELATIVE ${CMAKE_SOURCE_DIR}
     "src/main/cpp/**.cpp"
)

add_library(${PACKAGE_NAME} SHARED
  ${shared_files}
  ${android_files}
)

include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/NitroGzip+autolinking.cmake)

include_directories(
  "src/main/cpp"
  "../cpp"
)

find_library(LOG_LIB log)
find_library(ZLIB_LIB z)

target_link_libraries(
  ${PACKAGE_NAME}
  ${LOG_LIB}
  ${ZLIB_LIB}
  android
)
