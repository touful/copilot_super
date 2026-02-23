"""Tests for copilot_super."""
import pytest

from copilot_super.core import greet


def test_greet_returns_hello():
    assert greet("World") == "Hello, World!"


def test_greet_with_name():
    assert greet("Alice") == "Hello, Alice!"


def test_greet_empty_name_raises():
    with pytest.raises(ValueError):
        greet("")
