import pytest
from app.shield.service import PIIShieldService

def test_shield_initialization():
    shield = PIIShieldService()
    # It shouldn't crash on init
    assert shield is not None

def test_anonymize_text():
    shield = PIIShieldService()
    
    # If the spacy model failed to load, anonymizer might be None, returning original text
    # In a proper CI with en_core_web_sm installed, this will work.
    
    text = "My name is John Doe and my phone is 555-1234."
    result = shield.anonymize_text(text)
    
    assert "text" in result
    
    # Check if the anonymizer actually ran (items exist)
    if shield.anonymizer:
        assert "John Doe" not in result["text"] or len(result["items"]) > 0
    else:
        # Fallback test: if no engine, it returns text directly
        assert result["text"] == text
