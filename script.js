// --- STORAGE ---
const Storage = {
  key: "atletas_db_2026",
  get: () => JSON.parse(localStorage.getItem("atletas_db_2026")) || [],
  save: (data) => localStorage.setItem("atletas_db_2026", JSON.stringify(data))
};

// --- CÁLCULOS ---
const Calc = {
  getIdade(data) {
    const hoje = new Date();
    const nasc = new Date(data);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    if (hoje.getMonth() < nasc.getMonth() || (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate())) idade--;
    return idade;
  },
  getFaixa(idade) {
    if (idade < 25) return "Até 24";
    if (idade <= 29) return "25–29";
    if (idade <= 34) return "30–34";
    if (idade <= 39) return "35–39";
    return "40+";
  },
  getTotalRX: (res) => res.filter(r => r.workout === "RX").length,
  getScore: (res) => res.reduce((acc, curr) => acc + Number(curr.score), 0)
};

// --- INTERFACE (UI) ---
const UI = {
  init() {
    if (document.getElementById('listaInscritos')) this.renderInscritos();
    if (document.getElementById('atletaSelect')) this.initResultados();
    if (document.getElementById('ranking')) this.renderRanking();
  },

  // CADASTRO
  cadastrarAtleta() {
    const nome = document.getElementById("nome").value;
    const nascimento = document.getElementById("dataNascimento").value;
    const sexo = document.getElementById("sexo").value;

    if (!nome || !nascimento || !sexo) return alert("Preencha tudo!");

    const atletas = Storage.get();
    atletas.push({
      id: Date.now(),
      nome, nascimento, sexo,
      faixaEtaria: Calc.getFaixa(Calc.getIdade(nascimento)),
      resultados: []
    });
    Storage.save(atletas);
    alert("Cadastrado!");
    location.reload();
  },

  // INSCRITOS
  renderInscritos() {
    const container = document.getElementById("listaInscritos");
    const atletas = Storage.get();
    container.innerHTML = "";

    atletas.forEach(a => {
      container.innerHTML += `
        <div class="list-item grid-inscritos">
          <div class="text-left"><input type="text" value="${a.nome}" disabled id="nome-${a.id}"></div>
          <div>
            <select disabled id="sexo-${a.id}">
              <option value="M" ${a.sexo === 'M' ? 'selected' : ''}>M</option>
              <option value="F" ${a.sexo === 'F' ? 'selected' : ''}>F</option>
            </select>
          </div>
          <div><input type="date" value="${a.nascimento}" disabled id="nasc-${a.id}"></div>
          <div><strong>${a.faixaEtaria}</strong></div>
          <div class="acoes">
            <button class="btn-editar" onclick="UI.toggleEdit(${a.id}, true)">✏️</button>
            <button class="btn-salvar" id="sv-${a.id}" style="display:none" onclick="UI.salvarEdicao(${a.id})">💾</button>
            <button class="btn-excluir" onclick="UI.excluirAtleta(${a.id})">🗑️</button>
          </div>
        </div>`;
    });
  },

  toggleEdit(id, modo) {
    document.getElementById(`nome-${id}`).disabled = !modo;
    document.getElementById(`sexo-${id}`).disabled = !modo;
    document.getElementById(`nasc-${id}`).disabled = !modo;
    document.getElementById(`sv-${id}`).style.display = modo ? 'inline-block' : 'none';
  },

  salvarEdicao(id) {
    let atletas = Storage.get();
    const idx = atletas.findIndex(a => a.id === id);
    atletas[idx].nome = document.getElementById(`nome-${id}`).value;
    atletas[idx].sexo = document.getElementById(`sexo-${id}`).value;
    atletas[idx].nascimento = document.getElementById(`nasc-${id}`).value;
    atletas[idx].faixaEtaria = Calc.getFaixa(Calc.getIdade(atletas[idx].nascimento));
    Storage.save(atletas);
    this.renderInscritos();
  },

  excluirAtleta(id) {
    if(confirm("Excluir?")) {
      Storage.save(Storage.get().filter(a => a.id !== id));
      this.renderInscritos();
    }
  },

  // RESULTADOS
  initResultados() {
    const select = document.getElementById("atletaSelect");
    Storage.get().forEach(a => {
      select.innerHTML += `<option value="${a.id}">${a.nome} (${a.sexo})</option>`;
    });
  },

  lancarResultado() {
    const id = Number(document.getElementById("atletaSelect").value);
    const rodada = Number(document.getElementById("rodada").value);
    const workout = document.getElementById("workout").value;
    const score = Number(document.getElementById("score").value);

    let atletas = Storage.get();
    const idx = atletas.findIndex(a => a.id === id);
    atletas[idx].resultados = atletas[idx].resultados.filter(r => r.rodada !== rodada);
    atletas[idx].resultados.push({ rodada, workout, score });
    Storage.save(atletas);
    alert("Salvo!");
  },

  // RANKING COM MEDALHAS
  renderRanking() {
    const container = document.getElementById("ranking");
    const fFaixa = document.getElementById("faixaFiltro").value;
    const fSexo = document.getElementById("sexoFiltro").value;
    
    let dados = Storage.get().filter(a => 
      (fFaixa === "GERAL" || a.faixaEtaria === fFaixa) && 
      (fSexo === "TODOS" || a.sexo === fSexo)
    );

    dados.sort((a, b) => {
      const rxA = Calc.getTotalRX(a.resultados);
      const rxB = Calc.getTotalRX(b.resultados);
      if (rxA !== rxB) return rxB - rxA;
      return Calc.getScore(b.resultados) - Calc.getScore(a.resultados);
    });

    container.innerHTML = "";
    dados.forEach((a, idx) => {
      const pos = idx + 1;
      let medalha = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "•";
      
      container.innerHTML += `
        <div class="list-item grid-ranking">
          <div class="posicao"><span style="font-size:1.5em">${medalha}</span><br><small>${pos}º</small></div>
          <div class="text-left">
            <strong>${a.nome}</strong><br>
            <small>${a.sexo} • ${a.faixaEtaria} • RX: ${Calc.getTotalRX(a.resultados)}</small>
          </div>
          <div>${this.getWodInfo(a, 1)}</div>
          <div>${this.getWodInfo(a, 2)}</div>
          <div>${this.getWodInfo(a, 3)}</div>
          <div class="score-highlight">${Calc.getScore(a.resultados)}</div>
        </div>`;
    });
  },

  getWodInfo(atleta, rodada) {
    const r = atleta.resultados.find(res => res.rodada === rodada);
    return r ? `<small>${r.workout}</small><br><strong>${r.score}</strong>` : "-";
  }
};

// Globalizar funções
window.cadastrarAtleta = () => UI.cadastrarAtleta();
window.lancarResultado = () => UI.lancarResultado();
window.mostrarRanking = () => UI.renderRanking();

document.addEventListener("DOMContentLoaded", () => UI.init());