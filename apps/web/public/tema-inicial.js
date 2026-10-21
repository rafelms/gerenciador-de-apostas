// Lê o tema salvo localmente e aplica a classe `dark` antes do React montar.
;(function () {
  try {
    var tema = localStorage.getItem('lotogestor:tema') || 'sistema'
    var escuro =
      tema === 'escuro' ||
      (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', escuro)
  } catch {
    // localStorage indisponível (modo privado): fica no tema claro.
  }
})()
