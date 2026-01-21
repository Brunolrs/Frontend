/**
 * ============================================================================
 * 1. CONFIGURAÇÃO E INICIALIZAÇÃO DO SERVIÇO
 * ============================================================================
 * Configuração das credenciais e cliente do Supabase.
 * - URL: Endpoint da API do projeto.
 * - KEY: Token público (anon key) para operações permitidas pelas Policies RLS.
 */
const SUPABASE_URL = "https://fcnjpdzxqceenfsprrvw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbmpwZHp4cWNlZW5mc3BycnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjQxNTAsImV4cCI6MjA4Mzk0MDE1MH0.da-1snEhvQjT3sbQ0vt-DQcmm-D-RzlQzgzkE0VdJpM";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * ============================================================================
 * 2. DATA LAYER (CAMADA DE DADOS)
 * ============================================================================
 * Objeto responsável por isolar todas as chamadas ao banco de dados.
 * Padrão: Todas as funções são assíncronas e retornam dados ou erros.
 */
const Data = {
  // Retorna a lista completa de atletas para o cálculo do ranking
  async getAtletas() {
    const { data } = await supabaseClient.from('atletas').select('*');
    return data || [];
  },

  // Busca as configurações dos WODs (ordem, tipo, datas)
  async getConfigs() {
    const { data } = await supabaseClient
      .from('workout_config')
      .select('*')
      .order('ordem', { ascending: true });
    return data || [];
  },

  // Atualiza um workout específico (Painel Admin)
  async updateConfig(id, updates) {
    const { error } = await supabaseClient.from('workout_config').update(updates).eq('id', id);
    if (error) alert("Erro ao salvar: " + error.message);
    else alert("Salvo!");
  },

  // Cria um novo workout no banco
  async addConfig(config) {
    const { error } = await supabaseClient.from('workout_config').insert([config]);
    return error;
  },

  // Remove um workout do banco
  async deleteConfig(id) {
    const { error } = await supabaseClient.from('workout_config').delete().eq('id', id);
    return error;
  },

  // Busca atleta por ID para edição ou lançamento de resultados
  async getAtletaById(id) {
    const { data } = await supabaseClient.from('atletas').select('*').eq('id', id).single();
    return data;
  },

  // Atualiza dados cadastrais ou o JSON de resultados do atleta
  async updateAtleta(id, updates) {
    const response = await supabaseClient.from('atletas').update(updates).eq('id', id);
    return response;
  },

  // Insere um novo atleta
  async addAtleta(atleta) {
    const { error } = await supabaseClient.from('atletas').insert([atleta]);
    return error;
  },

  // Remove um atleta do banco
  async deleteAtleta(id) {
    await supabaseClient.from('atletas').delete().eq('id', id);
  }
};

/**
 * ============================================================================
 * 3. REGRAS DE NEGÓCIO E CÁLCULOS (CORE LOGIC)
 * ============================================================================
 * Contém a lógica pura para determinar categorias, idades e ordenação.
 */
const Calc = {
  // Calcula a idade baseada em string de data (suporta formatos BR e ISO)
  getIdade(d) {
    if (!d) return 0;
    const p = d.includes('/') ? d.split('/') : d.split('-');
    const y = d.includes('/') ? p[2] : p[0];
    return new Date().getFullYear() - Number(y);
  },

  // Define a categoria de idade do atleta
  getFaixa(i) {
    if (i < 25) return "Até 24";
    if (i <= 29) return "25–29";
    if (i <= 34) return "30–34";
    if (i <= 39) return "35–39";
    return "40+";
  },

  /**
   * Determina o "Tier" (Nível) de um resultado específico.
   * Hierarquia Lógica: RX (3) > Scale (2) > Foundation (1)
   */
  getTier(w) {
    if (!w) return 1;
    const t = String(w).toUpperCase().trim();
    if (t.includes("RX")) return 3;
    if (t.includes("SCALE") || t.includes("SC")) return 2;
    return 1;
  },

  /**
   * Determina a Categoria Geral do Atleta para fins de exibição.
   * Regra do "Menor Denominador": Se o atleta fez qualquer WOD em uma
   * categoria inferior (ex: Foundation), ele é classificado nela globalmente.
   */
  getOverallCategoryTier(resultados) {
    if (!resultados || resultados.length === 0) return 3; // Default RX
    let hasFoundation = false;
    let hasScale = false;

    resultados.forEach(r => {
      const tier = this.getTier(r.workout);
      if (tier === 1) hasFoundation = true;
      if (tier === 2) hasScale = true;
    });

    if (hasFoundation) return 1;
    if (hasScale) return 2;
    return 3;
  },

  // Retorna o Label visual da categoria geral
  getCategoriaLabel(res) {
    const tier = this.getOverallCategoryTier(res);
    if (tier === 3) return "RX";
    if (tier === 2) return "SCALE";
    return "FOUNDATION";
  },

  // Helper para verificar se string é tempo (MM:SS)
  isTime(v) { return String(v).includes(':'); },

  // Normaliza o score para número (segundos ou repetições) para comparação
  parseScore(v) {
    if (!v) return 0;
    const s = String(v).trim();
    if (s.includes(':')) {
      const [m, sc] = s.split(':').map(Number);
      return (m * 60) + sc;
    }
    return Number(s);
  },

  /**
   * Ordena um grupo de atletas dentro da mesma categoria (Ex: Só os RX).
   * Lógica:
   * - WOD 'TIME': Menor tempo ganha. Se alguém não terminou (tem Reps), perde para quem tem Tempo.
   * - WOD 'REPS'/'CARGA': Maior valor ganha.
   */
  sortGroup(list, tipoWod, configId) {
    return list.sort((a, b) => {
      const resA = a.resultados.find(r => r.rodada === configId);
      const resB = b.resultados.find(r => r.rodada === configId);

      const valA = this.parseScore(resA.score);
      const valB = this.parseScore(resB.score);

      if (tipoWod === 'TIME') {
        const isTimeA = this.isTime(resA.score);
        const isTimeB = this.isTime(resB.score);

        // Prioridade: Tempo > Reps (Cap estourado)
        if (isTimeA && !isTimeB) return -1; // A (Tempo) ganha de B (Reps)
        if (!isTimeA && isTimeB) return 1;

        // Se ambos Tempo: Menor é melhor
        if (isTimeA && isTimeB) return valA - valB;

        // Se ambos Reps: Maior é melhor
        return valB - valA;
      }
      // Outros tipos: Maior é melhor
      return valB - valA;
    });
  }
};

/**
 * ============================================================================
 * 4. UI CONTROLLER (INTERFACE)
 * ============================================================================
 * Gerencia a renderização HTML, eventos do DOM e orquestração de dados.
 */
const UI = {
  atletasCache: [],
  configsCache: [],

  // Inicialização da aplicação
  async init() {
    this.configsCache = await Data.getConfigs();

    // Renderiza componentes baseados na página atual
    if (document.getElementById("listaInscritos")) await this.renderInscritos();
    if (document.getElementById("buscaAtleta")) await this.initResultados();
    if (document.getElementById("ranking")) await this.renderRanking();

    this.renderOptionsRodada();
    if (document.getElementById("configList")) await this.renderConfigWorkouts();

    // Monitora mudança no select de rodada para verificar prazo
    const selRodada = document.getElementById("rodada");
    if (selRodada) {
      selRodada.addEventListener("change", () => this.verificarPrazo());
      setTimeout(() => this.verificarPrazo(), 500);
    }
  },

  // --------------------------------------------------------------------------
  // LÓGICA DE RANKING (COM PENALIDADE ACUMULATIVA)
  // --------------------------------------------------------------------------

  // Renderiza o cabeçalho da tabela dinamicamente (colunas dos WODs)
  renderRankingHeader(configs) {
    const h = document.querySelector(".list-header.grid-ranking");
    if (!h) return;
    const gridStyle = `50px 2fr repeat(${configs.length}, minmax(80px, 1fr)) 70px`;
    h.style.setProperty('--grid-cols', gridStyle);
    let html = `<div>Rank</div><div style="text-align:left">Atleta</div>`;
    configs.forEach(c => html += `<div class="wod-col-header" style="color:var(--btn-primary)">${c.nome || `26.${c.id}`}</div>`);
    html += `<div>POINTS</div>`;
    h.innerHTML = html;
    return gridStyle;
  },

  async renderRanking() {
    const container = document.getElementById("ranking");
    if (!container) return;
    container.innerHTML = "<p style='text-align:center; padding:20px;'>Calculando pontuação...</p>";

    const configs = this.configsCache;
    const gridStyle = this.renderRankingHeader(configs);

    // Captura filtros ativos
    const fSexo = document.getElementById("sexoFiltro").value;
    const fCategoria = document.getElementById("categoriaFiltro").value;
    const fFaixa = document.getElementById("faixaFiltro").value;

    let atletas = await Data.getAtletas();

    // 1. Filtragem Inicial
    atletas = atletas.filter(a => {
      const faixa = a.faixa_etaria || a.faixaEtaria;
      const catLabel = Calc.getCategoriaLabel(a.resultados || []);
      const matchSexo = (fSexo === "TODOS" || a.sexo === fSexo);
      const matchCat = (fCategoria === "TODAS" || catLabel === fCategoria);
      const matchFaixa = (fFaixa === "GERAL" || faixa === fFaixa);
      return matchSexo && matchCat && matchFaixa;
    });

    const activeWods = new Set();
    atletas.forEach(a => a.resultados?.forEach(r => activeWods.add(r.rodada)));

    // 2. Cálculo de Pontuação por WOD (Com Penalidade Acumulativa)
    configs.forEach(conf => {
      if (!activeWods.has(conf.id)) return;

      let participantes = atletas.filter(a => a.resultados && a.resultados.find(r => r.rodada === conf.id));

      // Separação em "Baldes" (Buckets) por Categoria feita no WOD
      let groupRX = participantes.filter(p => {
        const res = p.resultados.find(r => r.rodada === conf.id);
        return Calc.getTier(res.workout) === 3;
      });
      let groupScale = participantes.filter(p => {
        const res = p.resultados.find(r => r.rodada === conf.id);
        return Calc.getTier(res.workout) === 2;
      });
      let groupFoundation = participantes.filter(p => {
        const res = p.resultados.find(r => r.rodada === conf.id);
        return Calc.getTier(res.workout) === 1;
      });

      // Ordenação Interna de cada Balde
      groupRX = Calc.sortGroup(groupRX, conf.tipo, conf.id);
      groupScale = Calc.sortGroup(groupScale, conf.tipo, conf.id);
      groupFoundation = Calc.sortGroup(groupFoundation, conf.tipo, conf.id);

      // Atribuição de Pontos e Penalidades
      let currentRank = 1;

      // Grupo RX: Pontuação Padrão (1, 2, 3...)
      // Retorna a SOMA TOTAL de pontos do grupo RX para penalizar o Scale
      let sumRXPoints = this.assignPointsToGroup(groupRX, conf.id, currentRank, 0);

      // Grupo Scale: Começa após o último RX
      // Penalidade = Soma de todos os pontos distribuídos no RX
      currentRank += groupRX.length;
      let sumScalePoints = this.assignPointsToGroup(groupScale, conf.id, currentRank, sumRXPoints);

      // Grupo Foundation: Começa após o último Scale
      // Penalidade = Soma RX + Soma Scale
      currentRank += groupScale.length;
      let totalPenaltyForFoundation = sumRXPoints + sumScalePoints;
      this.assignPointsToGroup(groupFoundation, conf.id, currentRank, totalPenaltyForFoundation);

      // Quem não fez o WOD: Penalidade Máxima (Total de Participantes + 5)
      const rankPenalidadeMax = participantes.length + 5;
      atletas.forEach(a => {
        if (!a.pontosWod) a.pontosWod = {};
        if (!a.pontosWod[conf.id]) a.pontosWod[conf.id] = rankPenalidadeMax;
      });
    });

    // 3. Ordenação Geral (Baseada na Menor Soma de Pontos)
    atletas.sort((a, b) => {
      let pointsA = 0, pointsB = 0;
      configs.forEach(c => {
        pointsA += (a.pontosWod?.[c.id] || 0);
        pointsB += (b.pontosWod?.[c.id] || 0);
      });

      // Critério Principal: Menos Pontos Vence
      // A penalidade aplicada acima já garante que RX < Scale < Foundation em pontos
      if (pointsA !== pointsB) return pointsA - pointsB;

      // Critério de Desempate: Melhores colocações individuais
      const ranksA = configs.map(c => a.pontosWod?.[c.id] || 999).sort((x, y) => x - y);
      const ranksB = configs.map(c => b.pontosWod?.[c.id] || 999).sort((x, y) => x - y);
      for (let i = 0; i < ranksA.length; i++) {
        if (ranksA[i] !== ranksB[i]) return ranksA[i] - ranksB[i];
      }
      return 0;
    });

    // 4. Renderização HTML
    container.innerHTML = "";
    const penalidadeRef = atletas.length + 5;

    atletas.forEach((a, idx) => {
      // Medalhas para Top 3
      const medalha = (idx + 1) === 1 ? "🥇" : (idx + 1) === 2 ? "🥈" : (idx + 1) === 3 ? "🥉" : `${idx + 1}º`;
      const res = a.resultados || [];

      // Soma total de pontos para exibição
      let total = 0;
      configs.forEach(c => { if (activeWods.has(c.id)) total += (a.pontosWod?.[c.id] || 0); });

      let colsHTML = "";
      let detailsHTML = "";

      // Gera células de cada WOD
      configs.forEach(c => {
        const label = c.nome || `26.${c.id}`;
        const wodInfo = this.getWodInfo(res, c.id);
        const pt = this.fmtPt(a.pontosWod?.[c.id], penalidadeRef);
        colsHTML += `<div class="wod-col">${wodInfo} <span class="pts-wod">${pt}</span></div>`;
        detailsHTML += `<div class="detalhe-box"><span>${label}</span> ${wodInfo}</div>`;
      });

      // Badge Visual de Categoria
      const tierGeral = Calc.getOverallCategoryTier(res);
      let catBadge = "";
      if (tierGeral === 3) catBadge = `<span style="color:#22c55e; font-size:0.7em; border:1px solid #22c55e; padding:1px 3px; border-radius:3px; margin-left:5px;">RX</span>`;
      if (tierGeral === 2) catBadge = `<span style="color:#fbbf24; font-size:0.7em; border:1px solid #fbbf24; padding:1px 3px; border-radius:3px; margin-left:5px;">SC</span>`;
      if (tierGeral === 1) catBadge = `<span style="color:#94a3b8; font-size:0.7em; border:1px solid #94a3b8; padding:1px 3px; border-radius:3px; margin-left:5px;">FD</span>`;

      container.innerHTML += `
        <div class="list-item grid-ranking" style="--grid-cols: ${gridStyle}" onclick="UI.toggleRankDetails(${a.id})">
          <div class="posicao">${medalha}</div>
          <div class="text-left nome-col">
            <strong>${a.nome}</strong>${catBadge}
            <br><small style="opacity:0.7">${a.sexo} • ${a.faixa_etaria}</small>
          </div>
          ${colsHTML}
          <div class="score-highlight">${total} <small>pts</small></div>
        </div>
        <div id="detalhes-${a.id}" class="ranking-details" style="display:none;">
            ${detailsHTML}
        </div>`;
    });
  },

  /**
   * Helper: Atribui pontos a um grupo e calcula a penalidade para o próximo.
   * @param {Array} sortedList - Lista de atletas ordenada por performance.
   * @param {Number} configId - ID do WOD.
   * @param {Number} startRank - Posição inicial (ex: 1 para RX, N+1 para Scale).
   * @param {Number} penaltyToAdd - Soma de pontos da categoria anterior.
   * @returns {Number} Soma dos pontos distribuídos neste grupo.
   */
  assignPointsToGroup(sortedList, configId, startRank, penaltyToAdd) {
    let sumPoints = 0; // Acumulador para retorno

    for (let i = 0; i < sortedList.length; i++) {
      const p = sortedList[i];
      if (!p.pontosWod) p.pontosWod = {};

      // Verifica empate com o anterior
      if (i > 0) {
        const prevP = sortedList[i - 1];
        const resCur = p.resultados.find(r => r.rodada === configId);
        const resPrev = prevP.resultados.find(r => r.rodada === configId);

        if (Calc.isTime(resCur.score) === Calc.isTime(resPrev.score) &&
          Calc.parseScore(resCur.score) === Calc.parseScore(resPrev.score)) {
          // Em caso de empate, copia a pontuação final (já penalizada) do anterior
          p.pontosWod[configId] = prevP.pontosWod[configId];
          sumPoints += p.pontosWod[configId];
          continue;
        }
      }

      // Cálculo Final: (Rank Sequencial) + (Penalidade da Categoria Acima)
      let finalScore = (startRank + i) + penaltyToAdd;

      p.pontosWod[configId] = finalScore;
      sumPoints += finalScore;
    }

    return sumPoints; // Retorna soma para ser usada no próximo nível
  },

  // --------------------------------------------------------------------------
  // GESTÃO DE INSCRITOS (EDIÇÃO E EXCLUSÃO)
  // --------------------------------------------------------------------------
  toggleEdit(id, modo) {
    const campos = ["nome", "sexo", "nasc"];
    campos.forEach(c => {
      const el = document.getElementById(`${c}-${id}`);
      if (el) {
        el.disabled = !modo;
        if (modo) {
          el.classList.add("input-editavel");
          if (c === "nome") el.focus();
        } else {
          el.classList.remove("input-editavel");
        }
      }
    });
    const btn = document.getElementById(`sv-${id}`);
    if (btn) btn.style.display = modo ? "inline-block" : "none";
  },

  async salvarEdicao(id) {
    const nome = document.getElementById(`nome-${id}`).value;
    const sexo = document.getElementById(`sexo-${id}`).value;
    const nasc = document.getElementById(`nasc-${id}`).value;

    if (!nome || !nasc) return alert("Preencha todos os campos");

    const di = this.formatarDataParaBanco(nasc);
    const faixa = Calc.getFaixa(Calc.getIdade(di));
    const btn = document.getElementById(`sv-${id}`);
    const org = btn.textContent;

    btn.textContent = "...";
    btn.disabled = true;

    const { error } = await Data.updateAtleta(id, { nome, sexo, nascimento: di, faixa_etaria: faixa });

    if (error) {
      alert("Erro: " + error.message);
      btn.textContent = org;
      btn.disabled = false;
    } else {
      alert("Atualizado!");
      this.renderInscritos();
    }
  },

  async renderInscritos() {
    const c = document.getElementById("listaInscritos");
    if (!c) return;
    c.innerHTML = "<p style='text-align:center'>Carregando...</p>";
    const ats = await Data.getAtletas();
    c.innerHTML = "";

    ats.forEach(a => {
      let nd = a.nascimento;
      if (a.nascimento && a.nascimento.includes('-')) {
        const p = a.nascimento.split('-');
        nd = `${p[2]}/${p[1]}/${p[0]}`;
      }
      c.innerHTML += `
        <div class="list-item grid-inscritos">
            <div class="text-left"><input id="nome-${a.id}" value="${a.nome}" disabled></div>
            <div>
                <select id="sexo-${a.id}" disabled>
                    <option value="M" ${a.sexo === "M" ? "selected" : ""}>M</option>
                    <option value="F" ${a.sexo === "F" ? "selected" : ""}>F</option>
                </select>
            </div>
            <div><input type="tel" id="nasc-${a.id}" value="${nd}" disabled maxlength="10" oninput="UI.mascaraData(this)"></div>
            <div><strong>${a.faixa_etaria}</strong></div>
            <div class="acoes">
                <button onclick="UI.toggleEdit(${a.id},true)">✏️</button>
                <button id="sv-${a.id}" style="display:none;background:var(--btn-success);color:white" onclick="UI.salvarEdicao(${a.id})">💾</button>
                <button style="background:var(--btn-delete)" onclick="UI.excluirAtleta(${a.id})">🗑️</button>
            </div>
        </div>`;
    });
  },

  async excluirAtleta(id) {
    if (confirm("Excluir?")) {
      await Data.deleteAtleta(id);
      this.renderInscritos();
    }
  },

  // --------------------------------------------------------------------------
  // ADMINISTRAÇÃO DE WORKOUTS
  // --------------------------------------------------------------------------
  async renderConfigWorkouts() {
    const c = document.getElementById("configList");
    if (!c) return;
    c.innerHTML = `<button onclick="UI.addWorkout()" class="admin-btn-add"><span>+</span> CRIAR WORKOUT</button>`;
    const cf = await Data.getConfigs();

    cf.forEach(x => {
      const i = new Date(x.data_inicio || new Date());
      i.setMinutes(i.getMinutes() - i.getTimezoneOffset());
      const f = new Date(x.data_limite);
      f.setMinutes(f.getMinutes() - f.getTimezoneOffset());

      c.innerHTML += `
        <div class="admin-card">
            <div class="admin-header">
                <h3>#${x.ordem} WORKOUT ${x.id}</h3>
                <span class="admin-badge-id">ID: ${x.id}</span>
            </div>
            <div class="admin-row">
                <div><label class="admin-label">Nome</label><input type="text" id="nome-${x.id}" value="${x.nome || ''}" class="admin-input"></div>
                <div><label class="admin-label">Ordem</label><input type="number" id="ordem-${x.id}" value="${x.ordem || x.id}" class="admin-input"></div>
            </div>
            <div style="margin-bottom:20px">
                <label class="admin-label">Tipo</label>
                <select id="tipo-${x.id}" class="admin-input">
                    <option value="REPS" ${x.tipo === 'REPS' ? 'selected' : ''}>REPS</option>
                    <option value="TIME" ${x.tipo === 'TIME' ? 'selected' : ''}>TIME</option>
                    <option value="CARGA" ${x.tipo === 'CARGA' ? 'selected' : ''}>CARGA</option>
                </select>
            </div>
            <div class="admin-row">
                <div><label class="admin-label" style="color:#fbbf24">Abertura</label><input type="datetime-local" id="inicio-${x.id}" value="${i.toISOString().slice(0, 16)}" class="admin-input date-start"></div>
                <div><label class="admin-label" style="color:#ef4444">Fechamento</label><input type="datetime-local" id="fim-${x.id}" value="${f.toISOString().slice(0, 16)}" class="admin-input date-end"></div>
            </div>
            <div style="display:flex;gap:10px">
                <button onclick="UI.salvarConfig(${x.id})" class="admin-btn-save">Salvar</button>
                <button onclick="UI.deleteWorkout(${x.id})" class="admin-btn-delete">Excluir</button>
            </div>
        </div>`;
    });
  },

  async addWorkout() {
    if (!confirm("Criar novo?")) return;
    const cs = await Data.getConfigs();
    const nId = cs.length > 0 ? Math.max(...cs.map(c => c.id)) + 1 : 1;
    const d = new Date();
    const d2 = new Date(); d2.setDate(d.getDate() + 7);
    await Data.addConfig({ id: nId, nome: `26.${nId}`, ordem: nId, tipo: 'REPS', data_inicio: d.toISOString(), data_limite: d2.toISOString() });
    this.renderConfigWorkouts();
  },

  async deleteWorkout(id) {
    if (confirm("Excluir?")) {
      await Data.deleteConfig(id);
      this.renderConfigWorkouts();
    }
  },

  async salvarConfig(id) {
    const n = document.getElementById(`nome-${id}`).value;
    const o = document.getElementById(`ordem-${id}`).value;
    const t = document.getElementById(`tipo-${id}`).value;
    const i = document.getElementById(`inicio-${id}`).value;
    const f = document.getElementById(`fim-${id}`).value;
    await Data.updateConfig(id, { nome: n, ordem: o, tipo: t, data_inicio: new Date(i).toISOString(), data_limite: new Date(f).toISOString() });
    location.reload();
  },

  // --------------------------------------------------------------------------
  // UTILITÁRIOS, LOGIN E LANÇAMENTO
  // --------------------------------------------------------------------------
  fmtPt(pt, pen) {
    if (!pt) return "";
    if (pt >= pen) return "";
    return `(${pt})`;
  },

  getWodInfo(r, id) {
    const x = r ? r.find(z => z.rodada === id) : null;
    return x ? `<small>${x.workout}</small><br><strong>${x.score}</strong>` : "-";
  },

  toggleRankDetails(id) {
    if (window.innerWidth > 768) return;
    const d = document.getElementById(`detalhes-${id}`);
    const l = d.previousElementSibling;
    if (d.style.display === "none") { d.style.display = "grid"; l.style.background = "rgba(0,174,239,0.1)"; }
    else { d.style.display = "none"; l.style.background = "var(--card-bg)"; }
  },

  mascaraData(i) {
    let v = i.value.replace(/\D/g, "");
    if (v.length > 2) v = v.replace(/^(\d{2})(\d)/, "$1/$2");
    if (v.length > 5) v = v.replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
    i.value = v;
  },

  formatarDataParaBanco(d) {
    if (!d || d.length !== 10) return "";
    const p = d.split('/');
    return `${p[2]}-${p[1]}-${p[0]}`;
  },

  async initResultados() {
    this.atletasCache = await Data.getAtletas();
    this.configsCache = await Data.getConfigs();
  },

  // Busca atleta para login (Autocomplete)
  buscarAtleta(t) {
    const l = document.getElementById("listaSugestoes");
    const i = document.getElementById("atletaId");
    i.value = "";
    if (!t) { l.style.display = "none"; return; }

    const f = this.atletasCache.filter(a => a.nome.toLowerCase().includes(t.toLowerCase()));
    l.innerHTML = "";

    if (f.length) {
      l.style.display = "block";
      f.forEach(a => {
        const d = document.createElement("div");
        d.className = "sugestao-item";
        d.innerHTML = `<strong>${a.nome}</strong> <small>(${a.sexo})</small>`;
        d.onclick = () => {
          document.getElementById("buscaAtleta").value = a.nome;
          i.value = a.id;
          i.setAttribute("data-nasc-real", a.nascimento);
          l.style.display = "none";
        };
        l.appendChild(d);
      });
    } else {
      l.style.display = "none";
    }
  },

  // Login: Validação de Data de Nascimento
  validarAtleta() {
    const i = document.getElementById("atletaId").value;
    const d1 = document.getElementById("dataNascimentoLogin").value;
    const d2 = document.getElementById("atletaId").getAttribute("data-nasc-real");

    if (!i) return alert("Selecione seu nome.");
    if (this.formatarDataParaBanco(d1) === d2) {
      document.getElementById("loginCard").style.display = "none";
      document.getElementById("formResultados").style.display = "block";
      document.getElementById("nomeAtletaDisplay").textContent = document.getElementById("buscaAtleta").value;
      this.verificarPrazo();
    } else {
      alert("Data incorreta!");
    }
  },

  // Verifica datas de abertura/fechamento do WOD
  verificarPrazo() {
    const rodadaId = document.getElementById("rodada").value;
    const config = this.configsCache.find(c => c.id == rodadaId);
    const btn = document.getElementById("btnSalvarResultado");
    const av = document.getElementById("avisoPrazo");
    const divP = document.getElementById("divPerguntaCap");
    const inp = document.getElementById("score");

    if (!config) return;

    const now = new Date();
    const ini = new Date(config.data_inicio);
    const lim = new Date(config.data_limite);
    const opt = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };

    if (now < ini) {
      btn.disabled = true; inp.disabled = true;
      btn.textContent = "AGUARDE O INÍCIO";
      btn.style.backgroundColor = "#fbbf24"; btn.style.color = "#000";
      if (av) { av.textContent = `Abre em: ${ini.toLocaleDateString('pt-BR', opt)}`; av.style.color = "#fbbf24"; }
    } else if (now > lim) {
      btn.disabled = true; inp.disabled = true;
      btn.textContent = "PRAZO ENCERRADO";
      btn.style.backgroundColor = "#475569"; btn.style.color = "#fff";
      if (av) { av.textContent = `Fechou em: ${lim.toLocaleDateString('pt-BR', opt)}`; av.style.color = "#ef4444"; }
    } else {
      btn.disabled = false; inp.disabled = false;
      btn.textContent = "SALVAR RESULTADO";
      btn.style.backgroundColor = "var(--btn-primary)"; btn.style.color = "#fff";
      if (av) { av.textContent = `Aberto até: ${lim.toLocaleDateString('pt-BR', opt)}`; av.style.color = "var(--btn-primary)"; }
    }

    if (config.tipo === 'TIME') {
      if (divP) divP.style.display = "block";
      const sim = document.querySelector('input[name="capCheck"][value="SIM"]');
      this.toggleInputType(sim && sim.checked);
    } else {
      if (divP) divP.style.display = "none";
      inp.placeholder = config.tipo === 'CARGA' ? "Carga (KG)" : "Repetições";
      inp.type = "number";
    }
  },

  toggleInputType(isTime) {
    const inp = document.getElementById("score");
    const lbl = document.getElementById("labelScore");
    inp.value = "";
    if (isTime) {
      lbl.textContent = "Tempo";
      inp.placeholder = "Ex: 12:30";
      inp.type = "text";
    } else {
      lbl.textContent = "Reps";
      inp.placeholder = "Ex: 185";
      inp.type = "number";
    }
  },

  // Salva resultado no JSONB do Supabase
  async lancarResultado() {
    const btn = document.getElementById("btnSalvarResultado");
    const id = document.getElementById("atletaId").value;
    const rodada = Number(document.getElementById("rodada").value);
    const workout = document.getElementById("workout").value;
    const scoreVal = document.getElementById("score").value;
    const cf = this.configsCache.find(c => c.id == rodada);

    if (!id || btn.disabled) return;
    if (!scoreVal) return alert("Digite resultado");

    if (cf.tipo === 'TIME') {
      const s = document.querySelector('input[name="capCheck"][value="SIM"]').checked;
      if (s && !scoreVal.includes(':')) return alert("Use dois pontos (Ex: 10:30)");
      if (!s && (scoreVal.includes(':') || isNaN(scoreVal))) return alert("Use apenas números.");
    }

    btn.textContent = "Salvando...";
    btn.disabled = true;

    const atl = await Data.getAtletaById(id);
    let res = atl.resultados || [];
    res = res.filter(r => r.rodada !== rodada); // Remove duplicata
    res.push({ rodada: rodada, workout: workout, score: scoreVal });

    await Data.updateAtleta(id, { resultados: res });
    alert("Salvo!");
    location.reload();
  },

  async cadastrarAtleta() {
    const btn = document.querySelector("button");
    btn.disabled = true;
    const n = document.getElementById("nome").value;
    const d = document.getElementById("dataNascimento").value;
    const s = document.getElementById("sexo").value;

    if (!n || !d || !s) { alert("Preencha tudo"); btn.disabled = false; return; }
    if (d.length < 10) { alert("Data incompleta"); btn.disabled = false; return; }

    const di = this.formatarDataParaBanco(d);
    const ex = await Data.getAtletas();
    const dup = ex.find(a => a.nome.toLowerCase() === n.toLowerCase() && a.nascimento === di);

    if (dup) { alert("Já cadastrado"); btn.disabled = false; return; }

    await Data.addAtleta({
      id: Date.now(),
      nome: n,
      nascimento: di,
      sexo: s,
      faixaEtaria: Calc.getFaixa(Calc.getIdade(di)),
      resultados: []
    });

    alert("Sucesso!");
    window.location.href = "inscritos.html";
  }
};

// Exports para o escopo global (HTML)
window.cadastrarAtleta = () => UI.cadastrarAtleta();
window.lancarResultado = () => UI.lancarResultado();
window.mostrarRanking = () => UI.renderRanking();
window.UI = UI;

// Inicializa quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => UI.init());