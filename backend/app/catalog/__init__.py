"""Catalog Service — sjednocené vyhledávání a procházení globálního katalogu
(MusicBrainz + Deezer) s mapováním lokální dostupnosti (MediaAsset).

Veřejné rozhraní pro routy je `app.catalog.service.CatalogService`; zbytek
modulu (musicbrainz.py, deezer.py, cache.py, rate_limit.py) jsou interní
adaptéry, na kterých service stojí.
"""
