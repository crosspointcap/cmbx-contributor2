@echo off
echo ============================================================
echo  CMBX Contributor Bloomberg Agent - Installer
echo ============================================================
echo.

echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.11 from python.org
    pause
    exit /b 1
)

echo Creating virtual environment...
python -m venv venv
if errorlevel 1 (
    echo ERROR: Failed to create virtual environment
    pause
    exit /b 1
)

echo Activating virtual environment...
call venv\Scripts\activate

echo Installing dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install requirements
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  IMPORTANT: Bloomberg blpapi wheel must be installed separately.
echo.
echo  1. Log in to your Bloomberg Terminal
echo  2. Download from: https://bloomberg.com/professional/support/api-library/
echo  3. Download the Python 3.11 wheel for your platform
echo  4. Run: pip install blpapi-3.x.x-cp311-cp311-win_amd64.whl
echo ============================================================
echo.

echo Creating start_agent.bat...
(
echo @echo off
echo cd /d "%~dp0"
echo call venv\Scripts\activate
echo python agent.py
echo pause
) > start_agent.bat

echo Adding to Windows startup...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "CMBXContributor" /t REG_SZ /d "%CD%\start_agent.bat" /f
if errorlevel 1 (
    echo WARNING: Could not add to startup. You may need to run as administrator.
) else (
    echo Added to Windows startup successfully.
)

echo.
echo ============================================================
echo  Setup complete!
echo.
echo  NEXT STEPS:
echo  1. Copy agent_config.env.example to agent_config.env
echo  2. Fill in your SUPABASE_URL and SUPABASE_KEY
echo  3. Set BBG_MODE=stub to test without Bloomberg
echo  4. Run start_agent.bat to launch the agent
echo  5. Look for the CMBX Contributor icon in your system tray
echo ============================================================
echo.
pause
