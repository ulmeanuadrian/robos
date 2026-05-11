#!/bin/bash
# tool-pdf-generator setup — installs PDF generation dependencies
set -e

echo "==> Checking PDF generation dependencies..."

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found."
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "  Install with: brew install python3"
  else
    echo "  Install with: apt install python3"
  fi
  exit 1
fi

# Check/install Python packages
MISSING=""
python3 -c "import markdown" 2>/dev/null || MISSING="$MISSING markdown"
python3 -c "import weasyprint" 2>/dev/null || MISSING="$MISSING weasyprint"

if [ -n "$MISSING" ]; then
  echo "==> Installing Python packages:$MISSING"

  # Try a normal install first. On Python 3.11+ (Mac/Linux) the OS may
  # mark python as externally-managed; retry with --break-system-packages
  # so the user isn't stuck. Suggest pipx/venv for production setups.
  if ! pip3 install $MISSING 2>/dev/null; then
    echo "    Standard pip install refused (likely externally-managed)."
    echo "    Retrying with --break-system-packages..."
    pip3 install --break-system-packages $MISSING || {
      echo "ERROR: Could not install $MISSING."
      echo "       Manual options:"
      echo "         - python3 -m venv .venv && source .venv/bin/activate && pip install $MISSING"
      echo "         - pipx install weasyprint  (if Python 3.11+ on Mac/Linux)"
      exit 1
    }
  fi
  echo "==> Python packages installed."
else
  echo "    All Python packages present."
fi

# Check pandoc (optional, nice-to-have)
if command -v pandoc &>/dev/null; then
  echo "    pandoc available ($(pandoc --version | head -1))"
else
  echo "    pandoc not found (optional — Python backend will be used)"
fi

echo "==> PDF generator ready."
