// Se ejecuta con el entorno de pruebas ya cargado (beforeEach disponible).
beforeEach(() => {
  const n = (globalThis as { __notifications?: { scheduled: Map<string, unknown>; state: { granted: boolean; canAskAgain: boolean } } }).__notifications;
  n?.scheduled.clear();
  if (n) {
    n.state.granted = true;
    n.state.canAskAgain = true;
  }
});
