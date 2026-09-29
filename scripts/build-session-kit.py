#!/usr/bin/env python3
"""Compatibility wrapper. The session kit is built by scripts/build-library.py."""

from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name("build-library.py")), run_name="__main__")
