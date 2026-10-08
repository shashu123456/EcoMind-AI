.PHONY: help install seed backend frontend build test demo clean

# The virtualenv lives at the repository root. Override on the command line if
# your interpreter has a different name or path, e.g. `make PY=.venv/bin/python`.
PY ?= python

help:
	@echo EcoMind AI - Make targets:
	@echo   make install    Install Python + Node dependencies (via launcher)
	@echo   make seed       Generate the dataset catalog and seed the database
	@echo   make backend    Run the FastAPI backend on :8000 (serves the SPA)
	@echo   make frontend   Typecheck + production build of the frontend
	@echo   make dev        Run the vite dev server on :5173 (HMR, proxies /api)
	@echo   make test       Run backend pytest suite
	@echo   make demo       Run the ten-stage end-to-end demo walk
	@echo   make clean      Remove build artifacts
	@echo.
	@echo Tip: for a one-click setup run ecomind.bat (Windows) or ./ecomind.sh.

install:
	$(PY) -m launcher.start --check || $(PY) -m launcher.start --no-install

seed:
	$(PY) backend/seed.py

backend:
	$(PY) backend/run.py

frontend:
	cd frontend && pnpm build:static

dev:
	cd frontend && pnpm dev:static

test:
	$(PY) -m pytest

demo:
	$(PY) scripts/demo_end_to_end.py

clean:
	$(PY) -c "import shutil; [shutil.rmtree(p, ignore_errors=True) for p in ['frontend/dist', '.pytest_cache', 'backend/tests/__pycache__']]"
