// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = "https://fcnjpdzxqceenfsprrvw.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbmpwZHp4cWNlZW5mc3BycnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjQxNTAsImV4cCI6MjA4Mzk0MDE1MH0.da-1snEhvQjT3sbQ0vt-DQcmm-D-RzlQzgzkE0VdJpM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- DATA LAYER ---
const Data = {
  async getAtletas() {
    const { data, error } = await supabaseClient
      .from('atletas')
      .select('*');
    if (error) {
      console.error(error);
      alert("Erro ao carregar dados.");
      return [];
    }
    return data;
  },

  async getAtletaById(id) {
    const { data, error } = await supabaseClient
      .from('atletas')
      .select('*')
      .eq('id', id)
      .single();
    return data;
  },

  async addAtleta(atleta) {
    const { error } = await supabaseClient.from('atletas').insert([{
      id: atleta.id,
      nome: atleta.nome,
      nascimento: atleta.nascimento,
      sexo: atleta.sexo,
      faixa_etaria: atleta.faixaEtaria,
      resultados: atleta.resultados
    }]);
    if (error) console.error(error);
    return error;
  },

  async updateAtleta(id, updates) {
    const { error } = await supabaseClient
      .from('atletas')
      .update(updates)
      .eq('id', id);
    if (error) console.error(error);
  },

  async deleteAtleta(id) {
    const { error } = await supabaseClient
      .from('atletas')
      .delete()
      .eq('id', id);
    if (error) console.error(error);
  }
};

// --- CÁLCULOS ---
const Calc = {
  getIdade(data) {
    const hoje = new Date();
    const nasc = new Date(data);
    const nascCorrigido = new Date(nasc.getUTCFullYear(), nasc.getUTCMonth(), nasc.getUTCDate());
    let idade = hoje.getFullYear() - nascCorrigido.getFullYear();
    const m = hoje.getMonth() - nascCorrigido.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascCorrigido.getDate())) idade--;
    return idade;
  },

  getFaixa(idade) {
    if (idade < 25) return "Até 24";
    if (idade <= 29) return "25–29";
    if (idade <= 34) return "30–34";
    if (idade <= 39) return "35–39";
    return "40+";
  },

  countRX(res) {
    if (!res) return 0;
    return res.filter(r => r.workout === "RX").length;
  },

  countScale(res) {
    if (!res) return 0;
    return res.filter(r => r.workout === "SCALE").length;
  },

  getScore(res) {
    if (!res) return 0;
    return res.reduce((acc, r) => acc + Number(r.score), 0);
  },

  getCategoriaPeso(res) {
    if (this.countRX(res) > 0) return 3;
    if (this.countScale(res) > 0) return 2;
    return 1; 
  },

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

  async cadastrarAtleta() {
    const btn = document.querySelector("button");
    btn.textContent = "Verificando...";
    btn.disabled = true;

    const nome = document.getElementById("nome").value;
    let nascimento = document.getElementById("dataNascimento").value;
    const sexo = document.getElementById("sexo").value;

    if (!nome || !nascimento || !sexo) {
      alert("Preencha todos os campos!");
      btn.textContent = "Finalizar Cadastro";
      btn.disabled = false;
      return;
    }

    if (nascimento.includes('/')) {
        const partes = nascimento.split('/');
        if (partes.length === 3) {
            nascimento = `${partes[2]}-${partes[1]}-${partes[0]}`;
        }
    }

    const atletasExistentes = await Data.getAtletas();
    const duplicado = atletasExistentes.find(a => 
      a.nome.trim().toLowerCase() === nome.trim().toLowerCase() && 
      a.nascimento === nascimento
    );

    if (duplicado) {
      alert("Este atleta já está cadastrado!");
      btn.textContent = "Finalizar Cadastro";
      btn.disabled = false;
      return;
    }

    btn.textContent = "Salvando...";

    const novoAtleta = {
      id: Date.now(),
      nome,
      nascimento,
      sexo,
      faixaEtaria: Calc.getFaixa(Calc.getIdade(nascimento)),
      resultados: []
    };

    const error = await Data.addAtleta(novoAtleta);

    if (!error) {
      alert("Cadastrado com sucesso!");
      window.location.href = "inscritos.html";
    } else {
      alert("Erro ao cadastrar.");
      btn.textContent = "Finalizar Cadastro";
      btn.disabled = false;
    }
  },

  async renderInscritos() {
    const container = document.getElementById("listaInscritos");
    container.innerHTML = "<p>Carregando...</p>";
    
    const atletas = await Data.getAtletas();
    container.innerHTML = "";

    atletas.forEach(a => {
      const faixa = a.faixa_etaria || a.faixaEtaria; 
      container.innerHTML += `
        <div class="list-item grid-inscritos">
          <div class="text-left"><input id="nome-${a.id}" value="${a.nome}" disabled></div>
          <div>
            <select id="sexo-${a.id}" disabled>
              <option value="M" ${a.sexo === "M" ? "selected" : ""}>M</option>
              <option value="F" ${a.sexo === "F" ? "selected" : ""}>F</option>
            </select>
          </div>
          <div><input type="date" id="nasc-${a.id}" value="${a.nascimento}" disabled></div>
          <div><strong>${faixa}</strong></div>
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
    const novoNasc = document.getElementById(`nasc-${id}`).value;
    const novaFaixa = Calc.getFaixa(Calc.getIdade(novoNasc));

    await Data.updateAtleta(id, {
      nome: novoNome,
      sexo: novoSexo,
      nascimento: novoNasc,
      faixa_etaria: novaFaixa
    });

    alert("Atualizado!");
    this.renderInscritos();
  },

  async excluirAtleta(id) {
    if (confirm("Tem certeza?")) {
      await Data.deleteAtleta(id);
      this.renderInscritos();
    }
  },

  async initResultados() {
    this.atletasCache = await Data.getAtletas();
    this.atletasCache.sort((a,b) => a.nome.localeCompare(b.nome));
  },

  buscarAtleta(termo) {
    const listaDiv = document.getElementById("listaSugestoes");
    const idInput = document.getElementById("atletaId");
    
    idInput.value = "";

    if (!termo || termo.length === 0) {
      listaDiv.style.display = "none";
      return;
    }

    const filtrados = this.atletasCache.filter(a => 
      a.nome.toLowerCase().includes(termo.toLowerCase())
    );

    listaDiv.innerHTML = "";
    if (filtrados.length > 0) {
      listaDiv.style.display = "block";
      filtrados.forEach(a => {
        const div = document.createElement("div");
        div.className = "sugestao-item";
        div.innerHTML = `<strong>${a.nome}</strong> <small>(${a.sexo})</small>`;
        div.onclick = () => this.selecionarAtleta(a.id, a.nome, a.nascimento); // Passamos a data também para validar
        listaDiv.appendChild(div);
      });
    } else {
      listaDiv.style.display = "none";
    }
  },

  // Guarda os dados no input hidden e na memória temporária para validar
  selecionarAtleta(id, nome, nascimento) {
    document.getElementById("buscaAtleta").value = nome;
    document.getElementById("atletaId").value = id;
    
    // Guardamos a data real num atributo data- para checar depois
    document.getElementById("atletaId").setAttribute("data-nasc-real", nascimento);
    
    document.getElementById("listaSugestoes").style.display = "none";
  },

  // --- NOVA FUNÇÃO DE VALIDAÇÃO DE SEGURANÇA ---
  validarAtleta() {
    const id = document.getElementById("atletaId").value;
    const dataDigitada = document.getElementById("dataNascimentoLogin").value; // DD/MM/AAAA
    const dataReal = document.getElementById("atletaId").getAttribute("data-nasc-real"); // AAAA-MM-DD

    if (!id) {
        alert("Por favor, selecione seu nome na lista.");
        return;
    }
    if (!dataDigitada || dataDigitada.length < 10) {
        alert("Digite sua data de nascimento completa.");
        return;
    }

    // Converte a data digitada para o formato do banco (AAAA-MM-DD) para comparar
    const partes = dataDigitada.split('/');
    const dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;

    if (dataFormatada === dataReal) {
        // Sucesso! Esconde login e mostra resultados
        document.getElementById("loginCard").style.display = "none";
        document.getElementById("formResultados").style.display = "block";
        document.getElementById("nomeAtletaDisplay").textContent = document.getElementById("buscaAtleta").value;
    } else {
        alert("Data de nascimento incorreta! Verifique se digitou certo.");
    }
  },
  // ----------------------------------------------

  async lancarResultado() {
    const btn = document.querySelector("#formResultados button");
    const id = document.getElementById("atletaId").value;
    const rodada = Number(document.getElementById("rodada").value);
    const workout = document.getElementById("workout").value;
    const score = Number(document.getElementById("score").value);

    if(!id) return alert("Erro de identificação. Recarregue a página.");

    btn.textContent = "Enviando...";
    btn.disabled = true;

    const atleta = await Data.getAtletaById(id);
    let resultadosAtuais = atleta.resultados || [];
    resultadosAtuais = resultadosAtuais.filter(r => r.rodada !== rodada);
    resultadosAtuais.push({ rodada, workout, score });

    await Data.updateAtleta(id, { resultados: resultadosAtuais });

    alert("Resultado salvo com sucesso!");
    location.reload(); 
  },

  async renderRanking() {
    const container = document.getElementById("ranking");
    if(!container) return;
    container.innerHTML = "Carregando Leaderboard...";

    const fFaixa = document.getElementById("faixaFiltro").value;
    const fSexo = document.getElementById("sexoFiltro").value;

    let dados = await Data.getAtletas();

    dados = dados.filter(a => {
        const faixa = a.faixa_etaria || a.faixaEtaria;
        return (fFaixa === "GERAL" || faixa === fFaixa) &&
               (fSexo === "TODOS" || a.sexo === fSexo);
    });

    dados.sort((a, b) => {
      const resA = a.resultados || [];
      const resB = b.resultados || [];
      const pesoA = Calc.getCategoriaPeso(resA);
      const pesoB = Calc.getCategoriaPeso(resB);
      if (pesoA !== pesoB) return pesoB - pesoA;
      const rxA = Calc.countRX(resA);
      const rxB = Calc.countRX(resB);
      if (rxA !== rxB) return rxB - rxA;
      const scA = Calc.countScale(resA);
      const scB = Calc.countScale(resB);
      if (scA !== scB) return scB - scA;
      return Calc.getScore(resB) - Calc.getScore(resA);
    });

    container.innerHTML = "";
    dados.forEach((a, idx) => {
      const pos = idx + 1;
      const medalha = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "•";
      const faixa = a.faixa_etaria || a.faixaEtaria;
      const res = a.resultados || [];

      container.innerHTML += `
        <div class="list-item grid-ranking">
          <div class="posicao"><span>${medalha}</span><br><small>${pos}º</small></div>
          <div class="text-left"><strong>${a.nome}</strong><br><small>${a.sexo} • ${faixa} • ${Calc.getCategoriaLabel(res)}</small></div>
          <div>${this.getWodInfo(res, 1)}</div>
          <div>${this.getWodInfo(res, 2)}</div>
          <div>${this.getWodInfo(res, 3)}</div>
          <div class="score-highlight">${Calc.getScore(res)}</div>
        </div>`;
    });
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