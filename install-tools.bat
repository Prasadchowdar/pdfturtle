@echo off
rem Installs the conversion engines the PDFturtle server uses. Prompts for licence agreement and admin rights.
echo Installing LibreOffice (Word/Excel/PowerPoint conversions)...
winget install --id TheDocumentFoundation.LibreOffice -e --source winget
rem Ghostscript is optional: the server falls back to its bundled WebAssembly build.
(
  echo done %date% %time%
  dir /b "C:\Program Files\LibreOffice\program\soffice.exe"
  dir /b /s "C:\Program Files\gs\gswin64c.exe"
) > "%USERPROFILE%\pdfturtle-install.log" 2>&1
echo.
echo Finished. You can close this window.
pause
