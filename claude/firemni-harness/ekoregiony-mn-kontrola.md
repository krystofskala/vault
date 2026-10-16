# Kontrola ekoregionů – Minnesota Terrain (Best of mapy)

Zpracoval: pracovní Claude Code, 16. 10. 2026. Zadal: Orchestr podle Kryštofa, schváleno Kryštofem.

## Souhrn

- **Všech 21 bodů sedí**: skutečný ekoregion CEC Level III (= kód typu 5.2.1) odpovídá přiřazenému. Žádný záběr není zařazený špatně.
- 2 body leží těsně za hranicí Minnesoty v Jižní Dakotě (sloupec Stát). Ekoregion je správně, jen záběr není z MN. Na boardu to může stát za poznámku.
- Nejblíž hranici svého ekoregionu jsou body ...942473 (2,9 km, 48d) a ...220487 (4,7 km, 47g). Pořád jsou ale uvnitř.

## Zdroj dat a metoda

- U.S. EPA, *Level IV Ecoregions of the Conterminous United States*, shapefile `us_eco_l4_no_st` (soubor aktualizován 14. 11. 2024), stažený z https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-continental-united-states (S3: `dmap-prod-oms-edc/ORD/Ecoregions/us/us_eco_l4.zip`). Pro test, jestli bod leží v MN, jsem použil `mn_eco_l4` ze stejného zdroje.
- Párování: přiřazené názvy typu „5.2.1 Northern Lakes and Forests“ jsou kódy **CEC North America Level III** (pole `NA_L3CODE`). Porovnával jsem kód. Ve stejném polygonu je i EPA US Level III (číslo, např. 50) a Level IV (např. 50o), uvádím je pro informaci.
- Metoda: převod WGS84 → USA Contiguous Albers (NAD83), test point-in-polygon (shapely). „Vzdálenost k hranici“ je vzdálenost bodu od hranice jeho ekoregionu NA L3 v km, vyplněná u všech bodů, protože žádný nesedící nebyl.

## Tabulka

| id | lat | lon | přiřazený | skutečný NA L3 (CEC) | EPA L3 | EPA L4 | sedí | k hranici [km] | stát |
|---|---|---|---|---|---|---|---|---|---|
| 3458764686865930101 | 46.6271821 | -93.2231566 | 5.2.1 Northern Lakes and Forests | 5.2.1 Northern Lakes and Forests | 50 Northern Lakes and Forests | 50o Glacial Lakes Upham and Aitkin | ano | 64.4 | MN |
| 3458764686865930092 | 47.6283046 | -94.7176218 | 5.2.1 Northern Lakes and Forests | 5.2.1 Northern Lakes and Forests | 50 Northern Lakes and Forests | 50r Chippewa Plains | ano | 14.3 | MN |
| 3458764686865930099 | 46.6089878 | -93.4562645 | 5.2.1 Northern Lakes and Forests | 5.2.1 Northern Lakes and Forests | 50 Northern Lakes and Forests | 50o Glacial Lakes Upham and Aitkin | ano | 65.3 | MN |
| 3458764686870590801 | 48.1211386 | -93.8979534 | 5.2.2 Northern Minnesota Wetlands | 5.2.2 Northern Minnesota Wetlands | 49 Northern Minnesota Wetlands | 49a Peatlands | ano | 34.3 | MN |
| 3458764686870590802 | 47.9584396 | -94.1519718 | 5.2.2 Northern Minnesota Wetlands | 5.2.2 Northern Minnesota Wetlands | 49 Northern Minnesota Wetlands | 49b Forested Lake Plains | ano | 8.5 | MN |
| 3458764686870590800 | 48.8840116 | -95.2930463 | 5.2.2 Northern Minnesota Wetlands | 5.2.2 Northern Minnesota Wetlands | 49 Northern Minnesota Wetlands | 49a Peatlands | ano | 12.6 | MN |
| 3458764686871077361 | 46.6644992 | -96.0120435 | 8.1.4 North Central Hardwood Forests | 8.1.4 North Central Hardwood Forests | 51 North Central Hardwood Forests | 51j Alexandria Moraines and Detroit Lakes Outwash Plain | ano | 21.0 | MN |
| 3458764686871077358 | 45.4984798 | -94.1976585 | 8.1.4 North Central Hardwood Forests | 8.1.4 North Central Hardwood Forests | 51 North Central Hardwood Forests | 51k McGrath Till Plain and Drumlins | ano | 47.4 | MN |
| 3458764686871077359 | 45.4964615 | -94.1639551 | 8.1.4 North Central Hardwood Forests | 8.1.4 North Central Hardwood Forests | 51 North Central Hardwood Forests | 51k McGrath Till Plain and Drumlins | ano | 46.2 | MN |
| 3458764686870590671 | 43.8390758 | -92.4893976 | 8.1.5 Driftless Area | 8.1.5 Driftless Area | 52 Driftless Area | 52c Rochester/Paleozoic Plateau Upland | ano | 8.7 | MN |
| 3458764686870590672 | 43.7106746 | -92.4682607 | 8.1.5 Driftless Area | 8.1.5 Driftless Area | 52 Driftless Area | 52c Rochester/Paleozoic Plateau Upland | ano | 5.0 | MN |
| 3458764686870590673 | 43.671766 | -92.3895174 | 8.1.5 Driftless Area | 8.1.5 Driftless Area | 52 Driftless Area | 52c Rochester/Paleozoic Plateau Upland | ano | 6.7 | MN |
| 3458764686870740446 | 45.2883909 | -96.4728399 | 9.2.1 Aspen Parkland/Northern Glaciated Plains | 9.2.1 Aspen Parkland/Northern Glaciated Plains | 46 Northern Glaciated Plains | 46o Minnesota River Prairie | ano | 27.6 | SD (mimo MN) |
| 3458764686870740447 | 44.3115796 | -96.7444369 | 9.2.1 Aspen Parkland/Northern Glaciated Plains | 9.2.1 Aspen Parkland/Northern Glaciated Plains | 46 Northern Glaciated Plains | 46m Big Sioux Basin | ano | 17.5 | SD (mimo MN) |
| 3458764686870740448 | 44.2654997 | -96.2982001 | 9.2.1 Aspen Parkland/Northern Glaciated Plains | 9.2.1 Aspen Parkland/Northern Glaciated Plains | 46 Northern Glaciated Plains | 46m Big Sioux Basin | ano | 28.1 | MN |
| 3458764686870942472 | 48.5726579 | -96.7488656 | 9.2.2 Lake Manitoba and Lake Agassiz Plain | 9.2.2 Lake Manitoba and Lake Agassiz Plain | 48 Lake Agassiz Plain | 48a Glacial Lake Agassiz Basin | ano | 23.5 | MN |
| 3458764686870942474 | 46.282365 | -96.4906895 | 9.2.2 Lake Manitoba and Lake Agassiz Plain | 9.2.2 Lake Manitoba and Lake Agassiz Plain | 48 Lake Agassiz Plain | 48a Glacial Lake Agassiz Basin | ano | 23.0 | MN |
| 3458764686870942473 | 47.0896401 | -95.9270842 | 9.2.2 Lake Manitoba and Lake Agassiz Plain | 9.2.2 Lake Manitoba and Lake Agassiz Plain | 48 Lake Agassiz Plain | 48d Lake Agassiz Plains | ano | 2.9 | MN |
| 3458764686871220487 | 44.7336463 | -93.0351175 | 9.2.3 Western Corn Belt Plains | 9.2.3 Western Corn Belt Plains | 47 Western Corn Belt Plains | 47g Lower St. Croix and Vermillion Valleys | ano | 4.7 | MN |
| 3458764686871220485 | 43.6376961 | -95.5845131 | 9.2.3 Western Corn Belt Plains | 9.2.3 Western Corn Belt Plains | 47 Western Corn Belt Plains | 47b Des Moines Lobe | ano | 51.1 | MN |
| 3458764686871220488 | 45.0574547 | -95.8514503 | 9.2.3 Western Corn Belt Plains | 9.2.3 Western Corn Belt Plains | 47 Western Corn Belt Plains | 47b Des Moines Lobe | ano | 20.9 | MN |
