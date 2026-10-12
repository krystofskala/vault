---
name: orbo-napady
description: Najde skutečné nedávné příběhy o AI selháních (Reddit, X, články) a z nich navrhne 3 premisy epizod Orba (AI stážista) česky na 2–3 věty. Použij, když uživatel chce nové nápady na Orba nebo napíše /orbo-napady.
---

# Orbo: nápady na epizody

1. Přečti playbook: `C:\Users\Admin\ai-kanal\playbook.md` (kopie ve vaultu `privydelek/ai-kanal/playbook.md`). Drž se sekce 1.
2. Pusť jednoho výzkumného agenta (general-purpose, background) s tímto zadáním (doplň dnešní datum a případné téma od uživatele):
   - Najdi 20–30 SKUTEČNÝCH nedávných příběhů, kde se lidem s AI (chatboti, asistenti, agenti, AI v práci a aplikacích) stalo něco vtipného, absurdního nebo trapného. Zdroje: Reddit, X a články, které o nich psaly. Použij WebSearch a WebFetch.
   - U každého: co se stalo (konkrétně), zdroj s URL a datem, proč je to relatable, „Orbo verze“ (kancelář, pohled AI, příčina → následek) a skóre srozumitelnost / vtipnost / relatabilita 1–5.
   - Vyřaď skutečné škody (zdraví, peníze, právo), konkrétní lidi, tragédie a provařené memy.
   - Vynech příběhy, které už byly v epizodách (seznam je v `C:\Users\Admin\ai-kanal\episodes`).
3. Z výsledků vyber 3 nejlepší a pošli je uživateli **česky**. U každé uveď:
   - *Skutečnost:* 1 věta,
   - *Orbo:* 2–3 věty, setup → eskalace → pointa,
   - proč by to fungovalo (1 věta).
   AI se v premise **opravdu splete** a pointa plyne z následku. Nekopíruj témata Alberty Tech.
4. Doporuč jednu premisu a zeptej se, kterou chce. Scénář nepiš, ten patří do `/orbo-scenar`.
