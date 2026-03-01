import pytest
import tempfile
import os
import json
import sys

# Ensure backend/ is on the path so `app.*` and `main` imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def temp_csv():
    """Create a temporary CSV file with sample training data."""
    fd, path = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, 'w') as f:
        f.write("instruction,input,output\n")
        f.write("Translate to French,Hello World,Bonjour le monde\n")
        f.write("Summarize this,My name is John Doe and I live in New York,John Doe is an NY resident\n")
        f.write("Empty input test,,Output without input\n")
        f.write("Missing data,,\n")
    yield path
    if os.path.exists(path):
        os.remove(path)


@pytest.fixture
def temp_csv_with_nan():
    """CSV with values that pandas might interpret as NaN."""
    fd, path = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, 'w') as f:
        f.write("instruction,input,output\n")
        f.write("Test nan,nan,This should keep the literal nan\n")
        f.write("Test NA,NA,This should keep the literal NA\n")
        f.write("Test None,None,This should keep the literal None\n")
    yield path
    if os.path.exists(path):
        os.remove(path)


@pytest.fixture
def temp_output_jsonl():
    fd, path = tempfile.mkstemp(suffix=".jsonl")
    os.close(fd)
    yield path
    if os.path.exists(path):
        os.remove(path)


@pytest.fixture
def temp_dir():
    """Create a temporary directory for tests that need file storage."""
    d = tempfile.mkdtemp()
    yield d
    import shutil
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def temp_text_files(temp_dir):
    """Create some text files for RAG ingestion tests."""
    files = []
    for i in range(3):
        path = os.path.join(temp_dir, f"doc_{i}.txt")
        with open(path, "w") as f:
            f.write(f"This is document {i}. " * 50)
        files.append(path)
    return files
