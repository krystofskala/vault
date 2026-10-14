"""Zdroj pro SideStore/AltStore (source.json): appka Prague Street Tracker
s nejnovější verzí. SideStore ho sleduje a novou verzi nabídne v Updates --
stejný princip jako u Opentify (krystofskala/Opentify,
.github/scripts/altstore_source.py). Volá ios-sideload workflow po vydání
buildu.

  python altstore_source.py <verze> <url ipa> <velikost> <cesta k source.json> [commit]
"""

import datetime
import json
import os
import sys

version, url, size, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
commit = sys.argv[5] if len(sys.argv) > 5 else ""
repo = os.environ.get("GITHUB_REPOSITORY", "krystofskala/vault")
raw = f"https://raw.githubusercontent.com/{repo}"

source = {
    "name": "Prague Street Tracker",
    "identifier": "com.krystofskala.praguestreettracker.source",
    "sourceURL": f"{raw}/altstore/source.json",
    "website": f"https://github.com/{repo}",
    "apps": [
        {
            "name": "Prague Street Tracker",
            "bundleIdentifier": "com.krystofskala.praguestreettracker",
            "developerName": "Kryštof",
            "subtitle": "Sleduje prošlé ulice Prahy",
            "localizedDescription": "Prague Street Tracker -- zaznamenává chůzi a vybarvuje prošlé ulice Prahy na mapě. Lokace nikdy neopustí telefon.",
            "iconURL": f"{raw}/{commit or 'main'}/App/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png",
            "tintColor": "1F6FEB",
            "versions": [
                {
                    "version": version,
                    # CFBundleVersion appky (= číslo běhu CI); SideStore podle
                    # verze + buildu pozná, že je update.
                    "buildVersion": version.rsplit(".", 1)[-1],
                    "localizedDescription": f"Build {version}.",
                    "date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "size": size,
                    "downloadURL": url,
                    "minOSVersion": "16.0",
                }
            ],
            "appPermissions": {
                "entitlements": [],
                "privacy": {
                    "NSLocationAlwaysAndWhenInUseUsageDescription": "Sleduje chůzi na pozadí, aby zaznamenal prošlé ulice.",
                    "NSMotionUsageDescription": "Rozlišuje chůzi od jízdy autem/kolem, aby jízda nebyla zapsaná jako prošlá ulice.",
                },
            },
        }
    ],
    "news": [],
    # Z čeho je verze postavená -- noční build (pokud se zapne) podle toho
    # pozná, jestli je co vydávat (SideStore cizí klíče ignoruje).
    "pragueTrackerCommit": commit,
}

with open(out, "w", encoding="utf-8") as f:
    json.dump(source, f, ensure_ascii=False, indent=2)
print(f"source.json: {version} -> {url}")
