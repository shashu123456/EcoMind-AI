.PHONY: help install seed backend frontend build test demo clean

# The virtualenv lives at the repository root. Override on the command line if
# your interpreter has a different name or path, e.g. `make PY=.venv/bin/python`.
PY ?= python
NPM ?= npm

help:
	@echo EcoMind AI - Make targets:
	@echo   make install    Create .venv and install Python + Node dependencies
	@echo   make seed       Generate the dataset catalog and seed the database
	@echo   make backend    Run the FastAPI backend on :8000
	@echo   make frontend   Run the Vite dev server on :5173
	@echo   make build      Typecheck + production build of the frontend
	@echo   make test       Run backend pytest suite
	@echo   make demo       Run the ten-stage end-to-end demo walk
	@echo   make clean      Remove build artifacts
	@echo.
	@echo Tip: for a one-click setup use Launch_EcoMind.bat (Windows) or ./launch.sh.

install:
	$(PY) -m launcher.start --check || $(PY) -m launcher.start --no-install

seed:
	$(PY) backend/seed.py

backend:
	$(PY) backend/run.py

frontend:
	cd frontend && $(NPM) run dev

build:
	cd frontend && npx tsc -b && npx vite build

test:
	$(PY) -m pytest

demo:
	$(PY) scripts/demo_end_to_end.py

clean:
	$(PY) -c "import shutil; [shutil.rmtree(p, ignore_errors=True) for p in ['frontend/dist', '.pytest_cache', 'backend/tests/__pycache__']]"
