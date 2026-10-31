// Configuração da app — troque aqui o endereço do Worker do Coach (pasta worker/).
// Depois do `npx wrangler deploy`, cole o URL que ele mostrar, sem barra no fim, ex.:
//   coachApi: 'https://max-provas-coach.<a-sua-conta>.workers.dev'
// Vazio = o Coach (chat e busca de provas) fica desligado e a aba mostra um aviso.
window.MAX_PROVAS_CONFIG = {
  coachApi: ''
};
