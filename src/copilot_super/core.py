"""Core functionality for copilot_super."""


def greet(name: str) -> str:
    """Return a greeting message for the given name.

    Args:
        name: The name to greet.

    Returns:
        A greeting string.
    """
    if not name:
        raise ValueError("name must not be empty")
    return f"Hello, {name}!"
