; ALJWHARAH ONE — NSIS installer (WebView2, no Electron)
!include "MUI2.nsh"
Name "ALJWHARAH ONE"
OutFile "ALJWHARAH-ONE-Setup.exe"
InstallDir "$LOCALAPPDATA\Aljwharah\ONE"
RequestExecutionLevel user
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Arabic"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "..\src-tauri\target\release\aljwharah-one.exe"
  CreateShortCut "$SMPROGRAMS\ALJWHARAH ONE.lnk" "$INSTDIR\aljwharah-one.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\ALJWHARAH ONE.lnk"
  RMDir /r "$INSTDIR"
SectionEnd
