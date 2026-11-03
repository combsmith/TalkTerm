"""Tests for analyze_sources.py"""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

# Add parent dir to path so we can import the script
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from analyze_sources import (
    iter_glob,
    resolve_inputs,
    detect_doc_type,
    suggest_groups,
    analyze,
    INCLUDE_EXTENSIONS,
    SKIP_DIRS,
)


@pytest.fixture
def temp_dir():
    """Create a temp directory with sample files."""
    with tempfile.TemporaryDirectory() as d:
        # Create sample files
        (Path(d) / "product-brief-foo.md").write_text("# Product Brief\nContent here")
        (Path(d) / "product-brief-foo-discovery-notes.md").write_text("# Discovery\nNotes")
        (Path(d) / "architecture-doc.md").write_text("# Architecture\nDesign here")
        (Path(d) / "research-report.md").write_text("# Research\nFindings")
        (Path(d) / "random.txt").write_text("Some text content")
        (Path(d) / "image.png").write_bytes(b"\x89PNG")
        # Create a subdirectory with more files
        sub = Path(d) / "subdir"
        sub.mkdir()
        (sub / "prd-v2.md").write_text("# PRD\nRequirements")
        # Create a skip directory
        skip = Path(d) / "node_modules"
        skip.mkdir()
        (skip / "junk.md").write_text("Should be skipped")
        yield d


class TestResolveInputs:
    def test_single_file(self, temp_dir):
        f = str(Path(temp_dir) / "product-brief-foo.md")
        result = resolve_inputs([f])
        assert len(result) == 1
        assert result[0].name == "product-brief-foo.md"

    def test_folder_recursion(self, temp_dir):
        result = resolve_inputs([temp_dir])
        names = {f.name for f in result}
        assert "product-brief-foo.md" in names
        assert "prd-v2.md" in names
        assert "random.txt" in names

    def test_folder_skips_excluded_dirs(self, temp_dir):
        result = resolve_inputs([temp_dir])
        names = {f.name for f in result}
        assert "junk.md" not in names

    def test_folder_skips_non_text_files(self, temp_dir):
        result = resolve_inputs([temp_dir])
        names = {f.name for f in result}
        assert "image.png" not in names

    def test_glob_pattern(self, temp_dir):
        pattern = str(Path(temp_dir) / "product-brief-*.md")
        result = resolve_inputs([pattern])
        assert len(result) == 2
        names = {f.name for f in result}
        assert "product-brief-foo.md" in names
        assert "product-brief-foo-discovery-notes.md" in names

    def test_deduplication(self, temp_dir):
        f = str(Path(temp_dir) / "product-brief-foo.md")
        result = resolve_inputs([f, f, f])
        assert len(result) == 1

    def test_mixed_inputs(self, temp_dir):
        file_path = str(Path(temp_dir) / "architecture-doc.md")
        folder_path = str(Path(temp_dir) / "subdir")
        result = resolve_inputs([file_path, folder_path])
        names = {f.name for f in result}
        assert "architecture-doc.md" in names
        assert "prd-v2.md" in names

    def test_nonexistent_path(self):
        result = resolve_inputs(["/nonexistent/path/file.md"])
        assert len(result) == 0


class TestIterGlob:
    @pytest.mark.parametrize("pattern", [
        "*.md",
        "**/*.md",
        "sub*/*.md",
        "**",
        "subdir/**/*.md",
        "*/prd-?2.md",
        "[pr]*.md",
        "missing/**/*.md",
    ])
    def test_matches_glob_on_plain_trees(self, temp_dir, pattern):
        import glob

        full = str(Path(temp_dir) / pattern)
        expected = {Path(p) for p in glob.glob(full, recursive=True)}
        assert set(iter_glob(full)) == expected

    def test_skips_hidden_names_unless_the_segment_starts_with_a_dot(self, temp_dir):
        hidden = Path(temp_dir) / ".hidden"
        hidden.mkdir()
        (hidden / "secret.md").write_text("x")
        assert hidden / "secret.md" not in iter_glob(str(Path(temp_dir) / "**" / "*.md"))
        assert hidden / "secret.md" in iter_glob(str(Path(temp_dir) / ".hidden" / "*.md"))

    def test_does_not_follow_directory_symlinks_under_double_star(self, temp_dir):
        loop = Path(temp_dir) / "subdir" / "loop"
        loop.symlink_to(Path(temp_dir), target_is_directory=True)
        (Path(temp_dir) / "subdir" / "loop2").symlink_to(
            Path(temp_dir), target_is_directory=True
        )
        result = iter_glob(str(Path(temp_dir) / "**" / "*.md"))
        assert not any("loop" in p.parts for p in result)
        assert Path(temp_dir) / "subdir" / "prd-v2.md" in result

    def test_stops_at_the_limit(self, temp_dir, capsys):
        for i in range(5):
            (Path(temp_dir) / f"extra-{i}.md").write_text("x")
        result = iter_glob(str(Path(temp_dir) / "*.md"), limit=3)
        assert len(result) == 3
        assert "matched 3+ paths" in capsys.readouterr().err

    def test_returns_a_literal_path_only_if_it_exists(self, temp_dir):
        existing = str(Path(temp_dir) / "random.txt")
        assert iter_glob(existing) == [Path(existing)]
        assert iter_glob(str(Path(temp_dir) / "nope.txt")) == []


class TestDetectDocType:
    @pytest.mark.parametrize("filename,expected", [
        ("product-brief-foo.md", "product-brief"),
        ("product_brief_bar.md", "product-brief"),
        ("foo-discovery-notes.md", "discovery-notes"),
        ("foo-discovery_notes.md", "discovery-notes"),
        ("architecture-overview.md", "architecture-doc"),
        ("my-prd.md", "prd"),
        ("research-report-q4.md", "research-report"),
        ("foo-distillate.md", "distillate"),
        ("changelog.md", "changelog"),
        ("readme.md", "readme"),
        ("api-spec.md", "specification"),
        ("design-doc-v2.md", "design-doc"),
        ("meeting-notes-2026.md", "meeting-notes"),
        ("brainstorm-session.md", "brainstorming"),
        ("user-interview-notes.md", "interview-notes"),
        ("random-file.md", "unknown"),
    ])
    def test_detection(self, filename, expected):
        assert detect_doc_type(filename) == expected


class TestSuggestGroups:
    def test_groups_brief_with_discovery_notes(self, temp_dir):
        files = [
            Path(temp_dir) / "product-brief-foo.md",
            Path(temp_dir) / "product-brief-foo-discovery-notes.md",
        ]
        groups = suggest_groups(files)
        # Should produce one group with both files
        paired = [g for g in groups if len(g["files"]) > 1]
        assert len(paired) == 1
        filenames = {f["filename"] for f in paired[0]["files"]}
        assert "product-brief-foo.md" in filenames
        assert "product-brief-foo-discovery-notes.md" in filenames

    def test_standalone_files(self, temp_dir):
        files = [
            Path(temp_dir) / "architecture-doc.md",
            Path(temp_dir) / "research-report.md",
        ]
        groups = suggest_groups(files)
        assert len(groups) == 2
        for g in groups:
            assert len(g["files"]) == 1

    def test_mixed_grouped_and_standalone(self, temp_dir):
        files = [
            Path(temp_dir) / "product-brief-foo.md",
            Path(temp_dir) / "product-brief-foo-discovery-notes.md",
            Path(temp_dir) / "architecture-doc.md",
        ]
        groups = suggest_groups(files)
        paired = [g for g in groups if len(g["files"]) > 1]
        standalone = [g for g in groups if len(g["files"]) == 1]
        assert len(paired) == 1
        assert len(standalone) == 1


class TestAnalyze:
    def test_basic_analysis(self, temp_dir):
        f = str(Path(temp_dir) / "product-brief-foo.md")
        output_file = str(Path(temp_dir) / "output.json")
        analyze([f], output_file)
        result = json.loads(Path(output_file).read_text())
        assert result["status"] == "ok"
        assert result["summary"]["total_files"] == 1
        assert result["files"][0]["doc_type"] == "product-brief"
        assert result["files"][0]["estimated_tokens"] > 0

    def test_routing_single_small_input(self, temp_dir):
        f = str(Path(temp_dir) / "product-brief-foo.md")
        output_file = str(Path(temp_dir) / "output.json")
        analyze([f], output_file)
        result = json.loads(Path(output_file).read_text())
        assert result["routing"]["recommendation"] == "single"

    def test_routing_fanout_many_files(self, temp_dir):
        # Create enough files to trigger fan-out (> 3 files)
        for i in range(5):
            (Path(temp_dir) / f"doc-{i}.md").write_text("x" * 1000)
        output_file = str(Path(temp_dir) / "output.json")
        analyze([temp_dir], output_file)
        result = json.loads(Path(output_file).read_text())
        assert result["routing"]["recommendation"] == "fan-out"

    def test_folder_analysis(self, temp_dir):
        output_file = str(Path(temp_dir) / "output.json")
        analyze([temp_dir], output_file)
        result = json.loads(Path(output_file).read_text())
        assert result["status"] == "ok"
        assert result["summary"]["total_files"] >= 4  # at least the base files
        assert len(result["groups"]) > 0

    def test_no_files_found(self):
        output_file = "/tmp/test_analyze_empty.json"
        analyze(["/nonexistent/path"], output_file)
        result = json.loads(Path(output_file).read_text())
        assert result["status"] == "error"
        os.unlink(output_file)

    def test_stdout_output(self, temp_dir, capsys):
        f = str(Path(temp_dir) / "product-brief-foo.md")
        analyze([f])
        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["status"] == "ok"
