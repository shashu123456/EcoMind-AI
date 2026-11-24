import os

from app.core.config import settings

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT") or os.environ.get("ECOMIND_PORT") or settings.port)
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        # One process is deliberate: the pipeline is CPU- and memory-bound, and
        # a second worker doubles resident memory without adding throughput on
        # the single-core instances this is deployed to.
        workers=1,
        # Render (and most managed proxies) terminate TLS in front of the app.
        # Trusting the forwarded headers makes the scheme and client address in
        # redirects and logs correct instead of localhost/http.
        proxy_headers=True,
        forwarded_allow_ips="*",
        timeout_keep_alive=75,
    )
