.PHONY: help seed backend frontend build test demo clean

PY = .venv\Scripts\python.exe

help:
	@echo EcoMind AI — Make targets:
	@echo   make seed       Seed the database (backend/data/ecomind.db)
	@echo   make backend    Run the FastAPI backend on :8000
	@echo   make frontend   Run the Vite dev server on :5173
	@echo   make build      Typecheck + production build of the frontend
	@echo   make test       Run backend pytest suite
	@echo   make demo       Run the 17-stage end-to-end demo walk
	@echo   make clean      Remove build artifacts

seed:
	cd backend && $(PY) seed.py

backend:
	$(PY) backend\run.py

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npx tsc -b && npx vite build

test:
	$(PY) -m pytest

demo:
	$(PY) scripts\demo_end_to_end.py

clean:
	-if exist frontend\dist rd /s /q frontend\dist
	-if exist .pytest_cache rd /s /q .pytest_cache
	-if exist backend\tests\__pycache__ rd /s /q backend\tests\__pycache__