#!/usr/bin/env python3
"""
Simple script to run the API server.
"""

import uvicorn
import os

if __name__ == "__main__":
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", 8000))
    workers = int(os.getenv("API_WORKERS", 1))
    reload = os.getenv("RELOAD", "false").lower() == "true"
    
    uvicorn.run(
        "api.main:app",
        host=host,
        port=port,
        workers=workers if not reload else 1,
        reload=reload
    )

