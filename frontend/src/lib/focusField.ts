// iPhone wysuwa klawiaturę tylko wtedy, gdy pole dostaje fokus w trakcie gestu palca (stuknięcie,
// puszczenie palca). Panel otwarty po przytrzymaniu pojawia się z opóźnieniem, więc `autoFocus`
// nie wystarcza - fokus dajemy jeszcze raz przy puszczeniu palca albo zaraz po stuknięciu.
export function focusEditField() {
  const field = document.querySelector<HTMLInputElement>("input[data-edit-field]");
  if (!field) return;
  field.focus();
  // Kursor na końcu tekstu - zwykle dopisujemy albo poprawiamy końcówkę
  field.setSelectionRange(field.value.length, field.value.length);
}
