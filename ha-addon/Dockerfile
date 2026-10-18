# Home Assistant buduje dodatek z tego pliku. Nie budujemy aplikacji od zera
# (to by trwało długo na słabym sprzęcie) - bierzemy gotowy obraz, który
# GitHub Actions buduje przy każdej zmianie w gałęzi main.
#
# HA podaje BUILD_VERSION = "version" z config.yaml. Obraz z tym numerem
# zawsze jest pobierany na nowo (":latest" HA mógłby wziąć ze starej pamięci).
ARG BUILD_FROM
ARG BUILD_VERSION
FROM ghcr.io/redragon03-bit/przepisy:${BUILD_VERSION}
