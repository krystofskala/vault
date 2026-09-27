"""Zjednodušená autentizace pro tuto fázi vývoje.

TODO: nahradit ověřením device-scoped JWT podle `bearerAuth` v
docs/openapi.yaml. Teď jen čte hlavičky, aby šel celý provisioning flow
end-to-end odzkoušet bez hotové auth vrstvy.
"""

from __future__ import annotations

from fastapi import Header


def get_current_user(
    x_user_id: str = Header(default="demo-user"),
    x_device_id: str = Header(default="demo-device"),
) -> tuple[str, str]:
    return x_user_id, x_device_id
