@echo off
setlocal enabledelayedexpansion
title Hmanager Pro - Android Build Tool
echo ====================================================
echo   Building Hmanager Pro Android Application (APK)...
echo ====================================================

:: Mode selection: defaults to "release" for normal production APK
set "BUILD_TYPE=%~1"
if "%BUILD_TYPE%"=="" set "BUILD_TYPE=release"
if /i "%BUILD_TYPE%"=="debug" (
  set "GRADLE_TASK=assembleArm64Debug"
  set "APK_SUBDIR=debug"
  set "APK_FILENAME=app-arm64-debug.apk"
  set "DIST_APK_NAME=Hmanager-Pro-arm64-debug.apk"
  set "MODE_LABEL=Debug"
  set "CARGO_RELEASE_FLAG="
) else (
  set "GRADLE_TASK=assembleArm64Release"
  set "APK_SUBDIR=release"
  set "APK_FILENAME=app-arm64-release.apk"
  set "DIST_APK_NAME=Hmanager-Pro-arm64-release.apk"
  set "MODE_LABEL=Release"
  set "CARGO_RELEASE_FLAG=--release"
)

echo Target Build Type: %MODE_LABEL%

:: Determine root directory (one level up from scripts)
set "PROJECT_ROOT=%~dp0.."
pushd "%PROJECT_ROOT%"

:: Android & Java Toolchain Fallback Detection
if "%JAVA_HOME%"=="" (
  if exist "G:\AndroidDev\jdk-21" set "JAVA_HOME=G:\AndroidDev\jdk-21"
  if exist "C:\Program Files\Eclipse Adoptium\jdk-21" set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21"
  if exist "C:\Program Files\Java\jdk-21" set "JAVA_HOME=C:\Program Files\Java\jdk-21"
)
if "%ANDROID_HOME%"=="" (
  if exist "G:\AndroidDev\android-sdk" set "ANDROID_HOME=G:\AndroidDev\android-sdk"
  if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
)
if "%NDK_HOME%"=="" (
  if exist "G:\AndroidDev\android-sdk\ndk\27.1.12297006" set "NDK_HOME=G:\AndroidDev\android-sdk\ndk\27.1.12297006"
  if exist "%ANDROID_HOME%\ndk" (
    for /d %%D in ("%ANDROID_HOME%\ndk\*") do set "NDK_HOME=%%D"
  )
)

:: MSVC Host Toolchain (for Cargo host build scripts / proc-macros)
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Tools\MSVC\14.29.30133\bin\Hostx64\x64" (
  set "PATH=C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Tools\MSVC\14.29.30133\bin\Hostx64\x64;%PATH%"
)

if not "%JAVA_HOME%"=="" set "PATH=%JAVA_HOME%\bin;%PATH%"
if not "%ANDROID_HOME%"=="" set "PATH=%ANDROID_HOME%\cmdline-tools\latest\bin;%ANDROID_HOME%\platform-tools;%PATH%"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Error: Node.js is not found in your system PATH.
  echo Please install Node.js from https://nodejs.org/
  popd
  pause
  exit /b 1
)

echo [1/4] Building Tailwind CSS...
call npm run build:css
if %errorlevel% neq 0 (
  echo Error: Tailwind CSS build failed.
  popd
  pause
  exit /b 1
)

echo [2/4] Compiling Rust Android Native Core via Cargo...
pushd src-tauri
call cargo build --target aarch64-linux-android %CARGO_RELEASE_FLAG% --features tauri/custom-protocol
set CARGO_ERR=%errorlevel%
popd
if %CARGO_ERR% neq 0 (
  echo Error: Cargo build for aarch64-linux-android failed.
  popd
  pause
  exit /b 1
)

echo [3/4] Assembling %MODE_LABEL% Android APK via Gradle...
pushd src-tauri\gen\android
call gradlew.bat %GRADLE_TASK% --no-daemon
set GRADLE_ERR=%errorlevel%
popd

if %GRADLE_ERR% equ 0 (
  echo [4/4] Exporting APK to centralized dist folder...
  if not exist "dist\android" mkdir "dist\android"
  
  set "SOURCE_APK=src-tauri\gen\android\app\build\outputs\apk\arm64\%APK_SUBDIR%\%APK_FILENAME%"
  if exist "%SOURCE_APK%" (
    copy /y "%SOURCE_APK%" "dist\android\%DIST_APK_NAME%" >nul
    copy /y "%SOURCE_APK%" "dist\%DIST_APK_NAME%" >nul
  )
  
  node scripts\export-builds.js

  echo.
  echo ====================================================
  echo   %MODE_LABEL% Android Build Succeeded!
  echo   Generated Output:
  echo     dist\%DIST_APK_NAME%
  echo     dist\android\%DIST_APK_NAME%
  echo ====================================================
  echo.
  echo Checking for connected Android devices via ADB...
  where adb >nul 2>nul
  if !errorlevel! equ 0 (
    call adb devices
    echo.
    echo To install to your connected phone or emulator, run:
    echo   adb install -r "dist\%DIST_APK_NAME%"
    echo.
  )
) else (
  echo.
  echo ====================================================
  echo   Error: Android build failed. See logs above.
  echo ====================================================
)

popd
if "%~2"=="--no-pause" exit /b %GRADLE_ERR%
if "%CI%"=="" pause
exit /b %GRADLE_ERR%
