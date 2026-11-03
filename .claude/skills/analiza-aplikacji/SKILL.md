---
name: analiza-aplikacji
description: Analiza aplikacji Przepisy - przegląd luk wobec innych aplikacji z przepisami (Paprika, Mealie, Tandoor, Cookidoo, KptnCook, Cookpad), błędów i usprawnień, z priorytetami P1-P3, jako dokument dla Dariusza. Użyj, gdy prosi o analizę, przegląd albo plan dalszych zmian.
---

# Analiza aplikacji i planu zmian

Wcześniejsze analizy (sprawdź je, żeby nie powtarzać zrobionych punktów):
- Usprawnienia, 2026-10-23: sekcje 1-5 wdrożone w 0.5.0 i 0.6.0.
- Luki wobec rynku, 2026-10-28: P1+P2 w 0.7.0, P3 w 0.8.0.
- Plan odtworzenia funkcji w stylu Cookpad (REA): `/mnt/project-files/rea/`.
- Pierwotna architektura: `/mnt/project-files/analiza/analiza-i-architektura.md`.

## Ograniczenia, których analiza musi się trzymać

- Tylko darmowe rozwiązania: bez płatnej domeny, hostingu i płatnych API (AI: darmowe
  limity Gemini/Groq/Mistral, Claude tylko jeśli jest klucz).
- Jedna aplikacja w jednym kontenerze Docker, dodatek HA (amd64), później Synology.
- Dostęp przez Tailscale; HTTPS przez `svc:przepisy`.
- Główne urządzenie iPhone 13 (Safari, PWA); mało przycisków na ekranie.
- Kod czytelny dla początkującego programisty.

## Przebieg

1. Przeczytaj aktualny kod (`README.md` - struktura, `backend/app`, `frontend/src`)
   i historię wydań (`git log --oneline`), żeby opisać stan faktyczny, nie z pamięci.
2. Porównanie z innymi aplikacjami: dla każdej luki - co mają inni, co mamy my, koszt
   wdrożenia (mały/średni/duży), czy mieści się w ograniczeniach.
3. Błędy znalezione w kodzie opisz z plikiem i linią oraz scenariuszem, który je wywołuje.
4. Priorytety:
   - **P1** - błędy i rzeczy, które psują codzienne użycie.
   - **P2** - duża wartość, rozsądny koszt.
   - **P3** - miłe dodatki, na później.
5. Wynik jako dokument (Claude Doc), po polsku, prostym językiem, z tabelą P1-P3 na górze.
   Nie wklejaj całości do wiadomości - w wiadomości tylko wniosek i link.
6. Zapytaj, które priorytety wdrożyć. Wdrożenie zwykle idzie jednym PR na priorytet
   i podbiciem wersji MINOR (skill `wydanie-dodatku`).
7. Zapisz link do dokumentu i decyzję Dariusza w pamięci projektu.
