// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = "https://fcnjpdzxqceenfsprrvw.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbmpwZHp4cWNlZW5mc3BycnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjQxNTAsImV4cCI6MjA4Mzk0MDE1MH0.da-1snEhvQjT3sbQ0vt-DQcmm-D-RzlQzgzkE0VdJpM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- DATA LAYER ---
const Data = {
  async getAtletas() {
    const { data, error } = await supabaseClient.from('atletas').select('*');
    if (error) { console.error(error); alert("Erro ao carregar dados."); return []; }
    return data;
  },

  async getAtletaById(id) {
    const { data, error } = await supabaseClient.from('atletas').select('*').eq('id', id).single();
    return data;
  },

  async addAtleta(atleta) {
    const { error } = await supabaseClient.from('atletas').insert([atleta]);
    if (error) console.error(error);
    return error;
  },

  async updateAtleta(id, updates) {
    const { error } = await supabaseClient.from('atletas').update(updates).eq('id', id);
    if (error) console.error(error);
  },

  async deleteAtleta(id) {
    const { error } = await supabaseClient.from('atletas').delete().eq('id', id);
    if (error) console.error(error);
  }
};

// --- CÁLCULOS ROBUSTOS ---
const Calc = {
  getIdade(dataString) {
    if (!dataString) return 0;
    let ano, mes, dia;
    if (dataString.includes('/')) {
        [dia, mes, ano] = dataString.split('/').map(Number);
    } else if (dataString.includes('-')) {
        [ano, mes, dia] = dataString.split('-').map(Number);
    } else {
        return 0;
    }
    const nasc = new Date(ano, mes - 1, dia);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) { idade--; }
    return idade;
  },

  getFaixa(idade) {
    if (idade < 25) return "Até 24";
    if (idade <= 29) return "25–29";
    if (idade <= 34) return "30–34";
    if (idade <= 39) return "35–39";
    return "40+";
  },

  // Contadores de Categoria
  countRX(res) { if (!res) return 0; return res.filter(r => r.workout === "RX").length; },
  countScale(res) { if (!res) return 0; return res.filter(r => r.workout === "SCALE").length; },
  
  // Soma de Pontos
  getScore(res) { if (!res) return 0; return res.reduce((acc, r) => acc + Number(r.score), 0); },
  
  // Rótulo Visual (Apenas para exibir na tela)
  getCategoriaLabel(res) {
    if (this.countRX(res) > 0) return "RX";
    if (this.countScale(res) > 0) return "SCALE";
    return "FOUNDATION";
  }
};

// --- UI ---
const UI = {
  atletasCache: [],

  async init() {
    if (document.getElementById("listaInscritos")) await this.renderInscritos();
    if (document.getElementById("buscaAtleta")) await this.initResultados();
    if (document.getElementById("ranking")) await this.renderRanking();
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-group')) {
            const lista = document.getElementById("listaSugestoes");
            if(lista) lista.style.display = 'none';
        }
    });
  },

  mascaraData(input) {
    let v = input.value;
    v = v.replace(/\D/g, ""); 
    if (v.length > 2) v = v.replace(/^(\d{2})(\d)/, "$1/$2");
    if (v.length > 5) v = v.replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
    input.value = v;
  },

  formatarDataParaBanco(dataBR) {
      if (!dataBR || dataBR.length !== 10) return "";
      const partes = dataBR.split('/');
      return `${partes[2]}-${partes[1]}-${partes[0]}`;
  },

  async cadastrarAtleta() {
    const btn = document.querySelector("button");
    btn.textContent = "Verificando..."; btn.disabled = true;

    const nome = document.getElementById("nome").value;
    const nascimentoBR = document.getElementById("dataNascimento").value;
    const sexo = document.getElementById("sexo").value;

    if (!nome || !nascimentoBR || !sexo) {
      alert("Preencha todos os campos!");
      btn.textContent = "Finalizar Cadastro"; btn.disabled = false; return;
    }
    if (nascimentoBR.length < 10) {
      alert("Digite a data completa: Dia, Mês e Ano.");
      btn.textContent = "Finalizar Cadastro"; btn.disabled = false; return;
    }

    const nascimentoISO = this.formatarDataParaBanco(nascimentoBR);
    const atletasExistentes = await Data.getAtletas();
    const duplicado = atletasExistentes.find(a => 
      a.nome.trim().toLowerCase() === nome.trim().toLowerCase() && 
      a.nascimento === nascimentoISO
    );

    if (duplicado) {
      alert("Este atleta já está cadastrado!");
      btn.textContent = "Finalizar Cadastro"; btn.disabled = false; return;
    }

    const novoAtleta = {
      id: Date.now(),
      nome,
      nascimento: nascimentoISO,
      sexo,
      faixaEtaria: Calc.getFaixa(Calc.getIdade(nascimentoISO)),
      resultados: []
    };

    const error = await Data.addAtleta(novoAtleta);

    if (!error) {
      alert("Cadastrado com sucesso!");
      window.location.href = "inscritos.html";
    } else {
      alert("Erro ao cadastrar.");
      btn.textContent = "Finalizar Cadastro"; btn.disabled = false;
    }
  },

  async renderInscritos() {
    const container = document.getElementById("listaInscritos");
    container.innerHTML = "<p>Carregando...</p>";
    const atletas = await Data.getAtletas();
    container.innerHTML = "";

    atletas.forEach(a => {
      let nascDisplay = a.nascimento;
      if (a.nascimento && a.nascimento.includes('-')) {
          const p = a.nascimento.split('-');
          nascDisplay = `${p[2]}/${p[1]}/${p[0]}`;
      }

      container.innerHTML += `
        <div class="list-item grid-inscritos">
          <div class="text-left"><input id="nome-${a.id}" value="${a.nome}" disabled></div>
          <div>
            <select id="sexo-${a.id}" disabled>
              <option value="M" ${a.sexo === "M" ? "selected" : ""}>M</option>
              <option value="F" ${a.sexo === "F" ? "selected" : ""}>F</option>
            </select>
          </div>
          <div><input type="tel" id="nasc-${a.id}" value="${nascDisplay}" disabled maxlength="10" oninput="UI.mascaraData(this)"></div>
          <div><strong>${a.faixa_etaria}</strong></div>
          <div class="acoes">
            <button onclick="UI.toggleEdit(${a.id}, true)">✏️</button>
            <button id="sv-${a.id}" style="display:none; background-color: var(--btn-save);" onclick="UI.salvarEdicao(${a.id})">💾</button>
            <button style="background-color: var(--btn-delete);" onclick="UI.excluirAtleta(${a.id})">🗑️</button>
          </div>
        </div>`;
    });
  },

  toggleEdit(id, modo) {
    ["nome", "sexo", "nasc"].forEach(campo => {
      const el = document.getElementById(`${campo}-${id}`);
      if(el) el.disabled = !modo;
    });
    const btnSave = document.getElementById(`sv-${id}`);
    if(btnSave) btnSave.style.display = modo ? "inline-block" : "none";
  },

  async salvarEdicao(id) {
    const novoNome = document.getElementById(`nome-${id}`).value;
    const novoSexo = document.getElementById(`sexo-${id}`).value;
    const nascBR = document.getElementById(`nasc-${id}`).value;
    const novoNascISO = this.formatarDataParaBanco(nascBR);
    
    if(!novoNascISO) { alert("Data inválida na edição."); return; }

    const novaFaixa = Calc.getFaixa(Calc.getIdade(novoNascISO));

    await Data.updateAtleta(id, {
      nome: novoNome, sexo: novoSexo, nascimento: novoNascISO, faixa_etaria: novaFaixa
    });

    alert("Atualizado!"); this.renderInscritos();
  },

  async excluirAtleta(id) {
    if (confirm("Tem certeza?")) { await Data.deleteAtleta(id); this.renderInscritos(); }
  },

  async initResultados() {
    this.atletasCache = await Data.getAtletas();
    this.atletasCache.sort((a,b) => a.nome.localeCompare(b.nome));
  },

  buscarAtleta(termo) {
    const listaDiv = document.getElementById("listaSugestoes");
    const idInput = document.getElementById("atletaId");
    idInput.value = "";

    if (!termo || termo.length === 0) { listaDiv.style.display = "none"; return; }

    const filtrados = this.atletasCache.filter(a => a.nome.toLowerCase().includes(termo.toLowerCase()));

    listaDiv.innerHTML = "";
    if (filtrados.length > 0) {
      listaDiv.style.display = "block";
      filtrados.forEach(a => {
        const div = document.createElement("div");
        div.className = "sugestao-item";
        div.innerHTML = `<strong>${a.nome}</strong> <small>(${a.sexo})</small>`;
        div.onclick = () => this.selecionarAtleta(a.id, a.nome, a.nascimento);
        listaDiv.appendChild(div);
      });
    } else { listaDiv.style.display = "none"; }
  },

  selecionarAtleta(id, nome, nascimento) {
    document.getElementById("buscaAtleta").value = nome;
    document.getElementById("atletaId").value = id;
    document.getElementById("atletaId").setAttribute("data-nasc-real", nascimento);
    document.getElementById("listaSugestoes").style.display = "none";
  },

  validarAtleta() {
    const id = document.getElementById("atletaId").value;
    const dataDigitada = document.getElementById("dataNascimentoLogin").value;
    const dataReal = document.getElementById("atletaId").getAttribute("data-nasc-real");

    if (!id) return alert("Por favor, selecione seu nome na lista.");
    if (!dataDigitada || dataDigitada.length < 10) return alert("Digite sua data de nascimento completa.");

    const dataDigitadaISO = this.formatarDataParaBanco(dataDigitada);

    if (dataDigitadaISO === dataReal) {
        document.getElementById("loginCard").style.display = "none";
        document.getElementById("formResultados").style.display = "block";
        document.getElementById("nomeAtletaDisplay").textContent = document.getElementById("buscaAtleta").value;
    } else { alert("Data de nascimento incorreta!"); }
  },

  async lancarResultado() {
    const btn = document.querySelector("#formResultados button");
    const id = document.getElementById("atletaId").value;
    const rodada = Number(document.getElementById("rodada").value);
    const workout = document.getElementById("workout").value;
    const score = Number(document.getElementById("score").value);

    if(!id) return alert("Erro de identificação. Recarregue.");

    btn.textContent = "Enviando..."; btn.disabled = true;

    const atleta = await Data.getAtletaById(id);
    let resultadosAtuais = atleta.resultados || [];
    resultadosAtuais = resultadosAtuais.filter(r => r.rodada !== rodada);
    resultadosAtuais.push({ rodada, workout, score });

    await Data.updateAtleta(id, { resultados: resultadosAtuais });

    alert("Resultado salvo!"); location.reload(); 
  },

  // --- RENDERIZAÇÃO DO RANKING (LÓGICA CORRIGIDA) ---
  async renderRanking() {
    const container = document.getElementById("ranking");
    if(!container) return;
    container.innerHTML = "Carregando Leaderboard...";

    const fFaixa = document.getElementById("faixaFiltro").value;
    const fSexo = document.getElementById("sexoFiltro").value;

    let dados = await Data.getAtletas();

    // Filtros
    dados = dados.filter(a => {
        return (fFaixa === "GERAL" || a.faixa_etaria === fFaixa) &&
               (fSexo === "TODOS" || a.sexo === fSexo);
    });

    // --- NOVA ORDENAÇÃO (Critério: Quantidade de RX > Quantidade de Scale > Pontos) ---
    dados.sort((a, b) => {
      const resA = a.resultados || [];
      const resB = b.resultados || [];
      
      // 1. Quem fez MAIS workouts RX ganha
      const rxA = Calc.countRX(resA);
      const rxB = Calc.countRX(resB);
      if (rxA !== rxB) return rxB - rxA; // Maior quantidade primeiro

      // 2. Se empatou no RX, quem fez MAIS workouts SCALE ganha
      const scaleA = Calc.countScale(resA);
      const scaleB = Calc.countScale(resB);
      if (scaleA !== scaleB) return scaleB - scaleA;

      // 3. Se empatou em tudo, quem tem MAIOR pontuação ganha
      const scoreA = Calc.getScore(resA);
      const scoreB = Calc.getScore(resB);
      return scoreB - scoreA;
    });

    container.innerHTML = "";
    dados.forEach((a, idx) => {
      const pos = idx + 1;
      const medalha = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : `${pos}º`;
      const res = a.resultados || [];
      
      container.innerHTML += `
        <div class="list-item grid-ranking" onclick="UI.toggleRankDetails(${a.id})">
          <div class="posicao">${medalha}</div>
          
          <div class="text-left nome-col">
            <strong>${a.nome}</strong> 
            <br><small style="opacity:0.7">${a.sexo} • ${a.faixa_etaria} • ${Calc.getCategoriaLabel(res)}</small>
          </div>
          
          <div class="wod-col">${this.getWodInfo(res, 1)}</div>
          <div class="wod-col">${this.getWodInfo(res, 2)}</div>
          <div class="wod-col">${this.getWodInfo(res, 3)}</div>
          
          <div class="score-highlight">${Calc.getScore(res)}</div>
        </div>

        <div id="detalhes-${a.id}" class="ranking-details" style="display:none;">
            <div class="detalhe-box"><span>26.1</span> ${this.getWodInfo(res, 1)}</div>
            <div class="detalhe-box"><span>26.2</span> ${this.getWodInfo(res, 2)}</div>
            <div class="detalhe-box"><span>26.3</span> ${this.getWodInfo(res, 3)}</div>
        </div>`;
    });
  },

  toggleRankDetails(id) {
    if (window.innerWidth > 768) return; 
    const detalhes = document.getElementById(`detalhes-${id}`);
    const linha = detalhes.previousElementSibling;

    if (detalhes.style.display === "none") {
        detalhes.style.display = "grid"; 
        linha.style.background = "rgba(0, 174, 239, 0.1)"; 
    } else {
        detalhes.style.display = "none";
        linha.style.background = "var(--card-bg)";
    }
  },

  getWodInfo(resultados, rodada) {
    if(!resultados) return "-";
    const r = resultados.find(res => res.rodada === rodada);
    return r ? `<small>${r.workout}</small><br><strong>${r.score}</strong>` : "-";
  }
};

window.cadastrarAtleta = () => UI.cadastrarAtleta();
window.lancarResultado = () => UI.lancarResultado();
window.mostrarRanking = () => UI.renderRanking();
window.UI = UI;

document.addEventListener("DOMContentLoaded", () => UI.init());