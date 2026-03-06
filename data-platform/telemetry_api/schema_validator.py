"""
JSON Schema validation for telemetry data.
"""

import json
from pathlib import Path
from typing import Dict, Any, List
import jsonschema
from jsonschema import validate, ValidationError


# Load the JSON schema
SCHEMA_PATH = Path(__file__).parent.parent / "data-structure" / "telemetry-schema.json"

_schema_cache = None


def load_schema() -> Dict[str, Any]:
    """Load and cache the JSON schema."""
    global _schema_cache
    if _schema_cache is None:
        with open(SCHEMA_PATH, 'r') as f:
            _schema_cache = json.load(f)
    return _schema_cache


def validate_telemetry_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate telemetry data against the JSON schema.
    
    Args:
        data: Telemetry data dictionary to validate
        
    Returns:
        Dictionary with 'valid' boolean and 'errors' list
    """
    schema = load_schema()
    errors = []
    
    try:
        # Convert datetime objects to ISO format strings for validation
        if 'timestamp' in data and hasattr(data['timestamp'], 'isoformat'):
            data = data.copy()
            data['timestamp'] = data['timestamp'].isoformat()
        
        validate(instance=data, schema=schema)
        return {"valid": True, "errors": []}
    except ValidationError as e:
        errors.append({
            "path": ".".join(str(x) for x in e.path),
            "message": e.message,
            "validator": e.validator
        })
        return {"valid": False, "errors": errors}
    except Exception as e:
        return {"valid": False, "errors": [{"message": str(e)}]}


def validate_batch(data_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Validate a batch of telemetry records.
    
    Returns:
        Dictionary with validation results for each record
    """
    results = []
    for idx, record in enumerate(data_list):
        validation = validate_telemetry_data(record)
        results.append({
            "index": idx,
            "valid": validation["valid"],
            "errors": validation.get("errors", [])
        })
    
    return {
        "total": len(data_list),
        "valid": sum(1 for r in results if r["valid"]),
        "invalid": sum(1 for r in results if not r["valid"]),
        "results": results
    }

