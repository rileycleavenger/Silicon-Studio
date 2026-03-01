import pytest
import os
import json
from app.preparation.service import DataPreparationService


def test_preview_csv(temp_csv):
    service = DataPreparationService()
    preview = service.preview_csv(temp_csv, limit=2)

    assert len(preview) == 2
    assert preview[0]["instruction"] == "Translate to French"
    assert preview[0]["input"] == "Hello World"
    assert preview[0]["output"] == "Bonjour le monde"


def test_preview_csv_file_not_found():
    service = DataPreparationService()
    with pytest.raises(ValueError, match="File not found"):
        service.preview_csv("/nonexistent/path.csv")


def test_preview_csv_nan_handling(temp_csv):
    """Empty cells should be empty strings, not 'nan'."""
    service = DataPreparationService()
    preview = service.preview_csv(temp_csv, limit=10)
    # Row 3 has empty input
    row_with_empty = next(r for r in preview if r["instruction"] == "Empty input test")
    assert row_with_empty["input"] == ""
    # Row 4 has empty output
    missing_row = next(r for r in preview if r["instruction"] == "Missing data")
    assert missing_row["output"] == ""


def test_convert_csv_to_jsonl(temp_csv, temp_output_jsonl):
    service = DataPreparationService()

    result = service.convert_csv_to_jsonl(
        file_path=temp_csv,
        output_path=temp_output_jsonl,
        instruction_col="instruction",
        input_col="input",
        output_col="output"
    )

    assert result["status"] == "success"
    assert result["rows_processed"] == 3  # 4 rows minus 1 skipped (missing data row)
    assert result["rows_skipped"] == 1

    with open(temp_output_jsonl, "r") as f:
        lines = f.readlines()
        assert len(lines) == 3

        record1 = json.loads(lines[0])
        assert "instruction" in record1
        assert "input" in record1
        assert "output" in record1
        assert record1["instruction"] == "Translate to French"
        assert record1["input"] == "Hello World"
        assert record1["output"] == "Bonjour le monde"

        # Empty input test row
        record3 = json.loads(lines[2])
        assert record3["instruction"] == "Empty input test"
        assert record3["input"] == ""
        assert record3["output"] == "Output without input"


def test_convert_csv_nan_values_preserved(temp_csv_with_nan, temp_output_jsonl):
    """Values like 'nan', 'NA', 'None' should be kept as literal strings, not treated as NaN."""
    service = DataPreparationService()
    result = service.convert_csv_to_jsonl(
        file_path=temp_csv_with_nan,
        output_path=temp_output_jsonl,
        instruction_col="instruction",
        input_col="input",
        output_col="output"
    )
    assert result["status"] == "success"
    assert result["rows_processed"] == 3

    with open(temp_output_jsonl, "r") as f:
        lines = f.readlines()
        record1 = json.loads(lines[0])
        assert record1["input"] == "nan"  # kept as literal string
        record2 = json.loads(lines[1])
        assert record2["input"] == "NA"


def test_convert_csv_file_not_found(temp_output_jsonl):
    service = DataPreparationService()
    with pytest.raises(ValueError, match="File not found"):
        service.convert_csv_to_jsonl("/nonexistent.csv", temp_output_jsonl, "a", None, "b")


def test_convert_csv_creates_output_dir(temp_csv):
    """Output directory should be created if it doesn't exist."""
    import tempfile
    output_path = os.path.join(tempfile.mkdtemp(), "subdir", "output.jsonl")

    service = DataPreparationService()
    result = service.convert_csv_to_jsonl(
        file_path=temp_csv,
        output_path=output_path,
        instruction_col="instruction",
        input_col="input",
        output_col="output"
    )
    assert result["status"] == "success"
    assert os.path.exists(output_path)


def test_convert_csv_without_input_col(temp_csv, temp_output_jsonl):
    """input_col=None should produce records with empty input field."""
    service = DataPreparationService()
    result = service.convert_csv_to_jsonl(
        file_path=temp_csv,
        output_path=temp_output_jsonl,
        instruction_col="instruction",
        input_col=None,
        output_col="output"
    )
    assert result["status"] == "success"
    with open(temp_output_jsonl, "r") as f:
        for line in f:
            record = json.loads(line)
            assert record["input"] == ""


def test_convert_csv_short_response_skipped(temp_output_jsonl):
    """Responses shorter than 3 chars should be skipped."""
    import tempfile
    fd, csv_path = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, 'w') as f:
        f.write("q,a\n")
        f.write("Question 1,OK\n")       # 2 chars - too short
        f.write("Question 2,Yes indeed\n")  # 10 chars - ok

    service = DataPreparationService()
    result = service.convert_csv_to_jsonl(csv_path, temp_output_jsonl, "q", None, "a")
    assert result["rows_processed"] == 1
    assert result["rows_skipped"] == 1
    os.remove(csv_path)
