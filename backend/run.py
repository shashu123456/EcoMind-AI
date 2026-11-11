import os

from app.core.config import settings

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT") or os.environ.get("ECOMIND_PORT") or settings.port)
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
