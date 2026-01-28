/**
 * ============================================================================
 * 1. CONFIGURAÇÃO E INICIALIZAÇÃO - Produção
 * ============================================================================
*/
const SUPABASE_URL = "https://fcnjpdzxqceenfsprrvw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbmpwZHp4cWNlZW5mc3BycnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjQxNTAsImV4cCI6MjA4Mzk0MDE1MH0.da-1snEhvQjT3sbQ0vt-DQcmm-D-RzlQzgzkE0VdJpM";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
 

/**
 * ============================================================================
 * 1. CONFIGURAÇÃO E INICIALIZAÇÃO - Teste
 * ============================================================================

const SUPABASE_URL = "https://rhjdelkpdmnzotdjddji.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoamRlbGtwZG1uem90ZGpkZGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDg0MzksImV4cCI6MjA4NTEyNDQzOX0.QSK316Id2FW_X2FDtIOdlima8v37dgQ3n9NuxVjFxwY";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
*/

/**
 * ============================================================================
 * 2. DATA LAYER (BANCO DE DADOS)
 * ============================================================================
 */
const Data = {
  async getAtletas() {
    const { data, error } = await supabaseClient.from("atletas").select("*");
    if (error) console.error("Erro ao buscar atletas:", error);
    return data || [];
  },
  async getConfigs() {
    const { data, error } = await supabaseClient
      .from("workout_config")
      .select("*")
      .order("ordem", { ascending: true });
    if (error) console.error("Erro ao buscar configs:", error);
    return data || [];
  },
  async updateConfig(id, updates) {
    const { error } = await supabaseClient.from("workout_config").update(updates).eq("id", id);
    if (error) alert("Erro: " + error.message);
    else alert("Salvo!");
  },
  async addConfig(config) {
    const { error } = await supabaseClient.from("workout_config").insert([config]);
    return error;
  },
  async deleteConfig(id) {
    const { error } = await supabaseClient.from("workout_config").delete().eq("id", id);
    return error;
  },
  async getAtletaById(id) {
    const { data, error } = await supabaseClient.from("atletas").select("*").eq("id", id).single();
    if (error) console.error("Erro ao buscar atleta:", error);
    return data;
  },
  async updateAtleta(id, updates) {
    return await supabaseClient.from("atletas").update(updates).eq("id", id);
  },
  async addAtleta(atleta) {
    const { error } = await supabaseClient.from("atletas").insert([atleta]);
    return error;
  },
  async deleteAtleta(id) {
    await supabaseClient.from("atletas").delete().eq("id", id);
  },
};

/**
 * ============================================================================
 * 3. LÓGICA DE NEGÓCIO (CÁLCULOS)
 * ============================================================================
 */
const Calc = {
  getIdade(d) {
    if (!d) return 0;
    let y;
    if (d.includes("-")) { y = d.split("-")[0]; } else { const p = d.split("/"); y = p[2]; }
    return new Date().getFullYear() - Number(y);
  },
  getFaixa(i) {
    if (i < 15) return "Até 15";
    if (i <= 24) return "16-24";
    if (i <= 29) return "25–29";
    if (i <= 34) return "30–34";
    if (i <= 39) return "35–39";
    return "40+";
  },
  getTier(w) {
    if (!w) return 1;
    const t = String(w).toUpperCase().trim();
    if (t.includes("RX")) return 3;
    if (t.includes("SCALE") || t.includes("SC")) return 2;
    return 1;
  },
  getOverallCategoryTier(resultados, totalWods) {
    if (!resultados || resultados.length === 0) return 1;
    if (typeof totalWods === "number" && totalWods > 0 && resultados.length < totalWods) {
      return 1; 
    }
    let hasFoundation = false;
    let hasScale = false;
    resultados.forEach((r) => {
      const tier = this.getTier(r.workout);
      if (tier === 1) hasFoundation = true;
      if (tier === 2) hasScale = true;
    });
    if (hasFoundation) return 1;
    if (hasScale) return 2;
    return 3;
  },
  getCategoriaLabel(res, totalWods) {
    const tier = this.getOverallCategoryTier(res, totalWods);
    if (tier === 3) return "RX";
    if (tier === 2) return "SCALE";
    return "FOUNDATION";
  },
  isTime(v) { return String(v).includes(":"); },
  parseScore(v) {
    if (!v) return 0;
    const s = String(v).trim();
    if (s.includes(":")) { const [m, sc] = s.split(":").map(Number); return m * 60 + sc; }
    return Number(s);
  },
  sortGroup(list, tipoWod, configId) {
    return list.sort((a, b) => {
      const resA = a.resultados.find((r) => r.rodada === configId);
      const resB = b.resultados.find((r) => r.rodada === configId);
      const valA = this.parseScore(resA.score);
      const valB = this.parseScore(resB.score);
      if (tipoWod === "TIME") {
        const isTimeA = this.isTime(resA.score);
        const isTimeB = this.isTime(resB.score);
        if (isTimeA && !isTimeB) return -1;
        if (!isTimeA && isTimeB) return 1;
        if (isTimeA && isTimeB) return valA - valB;
        return valB - valA;
      }
      return valB - valA;
    });
  },
};

/**
 * ============================================================================
 * 4. UI CONTROLLER (INTERFACE)
 * ============================================================================
 */
const UI = {
  atletasCache: [],
  configsCache: [],

  async init() {
    this.configsCache = await Data.getConfigs();
    const selWod = document.getElementById("workoutFiltro");
    if (selWod && this.configsCache.length > 0) {
      selWod.innerHTML = '<option value="GERAL">Ranking Geral</option>';
      this.configsCache.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.nome || `WOD ${c.id}`;
        selWod.appendChild(opt);
      });
    }
    if (document.getElementById("listaInscritos")) await this.renderInscritos();
    if (document.getElementById("buscaAtleta")) await this.initResultados();
    if (document.getElementById("ranking")) await this.renderRanking();
    this.renderOptionsRodada();
    if (document.getElementById("configList")) await this.renderConfigWorkouts();
    const selRodada = document.getElementById("rodada");
    if (selRodada) {
      selRodada.addEventListener("change", () => this.verificarPrazo());
      setTimeout(() => this.verificarPrazo(), 500);
    }
    this.initRealtime();
  },

  initRealtime() {
    console.log("Iniciando Realtime...");
    const channel = supabaseClient
      .channel('tabela-atletas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atletas' }, async (payload) => {
          console.log('Update:', payload);
          this.atletasCache = await Data.getAtletas();
          if (document.getElementById("ranking")) { await this.renderRanking(); }
          if (document.getElementById("listaInscritos")) { await this.renderInscritos(); }
        }
      )
      .subscribe();
  },

  renderRankingHeader(configs, selectedWodId) {
    const h = document.querySelector(".list-header.grid-ranking");
    if (!h) return;
    if (selectedWodId === "GERAL") {
      const gridStyle = `50px 2fr repeat(${configs.length}, minmax(80px, 1fr)) 70px`;
      h.style.setProperty("--grid-cols", gridStyle);
      let html = `<div>Rank</div><div style="text-align:left">Atleta</div>`;
      configs.forEach((c) => (html += `<div class="wod-col-header" style="color:var(--btn-primary)">${c.nome || c.id}</div>`));
      html += `<div>POINTS</div>`;
      h.innerHTML = html;
    } else {
      const gridStyle = `50px 2fr 1fr 70px`;
      h.style.setProperty("--grid-cols", gridStyle);
      const wodName = configs.find((c) => c.id == selectedWodId)?.nome || "Resultado";
      h.innerHTML = `<div>Rank</div><div style="text-align:left">Atleta</div><div style="color:var(--btn-primary)">${wodName}</div><div>PTS</div>`;
    }
  },

  // ============================================================
  // FUNÇÃO PRINCIPAL DE CÁLCULO DE RANKING (REGRAS 1-7)
  // ============================================================
  async renderRanking() {
    const container = document.getElementById("ranking");
    if (!container) return;
    if(container.innerHTML.trim() === "") container.innerHTML = "<p style='text-align:center; padding:20px;'>Calculando...</p>";

    const configs = this.configsCache;
    const totalWods = configs.length;
    const fWod = document.getElementById("workoutFiltro")?.value || "GERAL";
    const fSexo = document.getElementById("sexoFiltro").value;
    const fCategoria = document.getElementById("categoriaFiltro").value;
    const fFaixa = document.getElementById("faixaFiltro").value;
    const fNome = document.getElementById("buscaRanking")?.value.toLowerCase().trim() || "";

    this.renderRankingHeader(configs, fWod);

    let atletas = await Data.getAtletas();

    // Filtros
    atletas = atletas.filter((a) => {
      const faixa = a.faixa_etaria || a.faixaEtaria;
      const catLabel = Calc.getCategoriaLabel(a.resultados || [], totalWods);
      const matchSexo = fSexo === "TODOS" || a.sexo === fSexo;
      const matchCat = fCategoria === "TODAS" || catLabel === fCategoria;
      const matchFaixa = fFaixa === "GERAL" || faixa === fFaixa;
      return matchSexo && matchCat && matchFaixa;
    });

    // ----------------------------------------------------
    // CÁLCULO DAS PONTUAÇÕES COM SOMA ACUMULATIVA (REGRAS 3, 4, 5)
    // ----------------------------------------------------
    configs.forEach((conf) => {
      let participantes = [];
      atletas.forEach((a) => {
        const res = a.resultados?.find((r) => r.rodada === conf.id);
        if (res) participantes.push({ atleta: a, res: res });
      });

      // Separa grupos
      let groupRX = [], groupScale = [], groupFoundation = [];
      participantes.forEach((p) => {
        const tier = Calc.getTier(p.res.workout);
        if (tier === 3) groupRX.push(p.atleta);
        else if (tier === 2) groupScale.push(p.atleta);
        else groupFoundation.push(p.atleta);
      });

      // Ordena cada grupo
      groupRX = Calc.sortGroup(groupRX, conf.tipo, conf.id);
      groupScale = Calc.sortGroup(groupScale, conf.tipo, conf.id);
      groupFoundation = Calc.sortGroup(groupFoundation, conf.tipo, conf.id);

      // --- ATRIBUIÇÃO DE PONTOS ---
      
      // 1. RX: Pontuação Normal (1, 2, 3...)
      let sumPointsRX = 0;
      groupRX.forEach((a, idx) => {
          if(!a.pontosWod) a.pontosWod = {};
          let pts = idx + 1;
          a.pontosWod[conf.id] = pts;
          sumPointsRX += pts;
      });

      // 2. SCALE: Rank + Soma dos pontos RX (Regra 3)
      let sumPointsSC = 0;
      groupScale.forEach((a, idx) => {
          if(!a.pontosWod) a.pontosWod = {};
          let pts = (idx + 1) + sumPointsRX; 
          a.pontosWod[conf.id] = pts;
          sumPointsSC += pts;
      });

      // 3. FOUNDATION: Rank + Soma RX + Soma SC (Regra 4 - acumulando para garantir hierarquia)
      // *Nota: A regra diz "soma de quem fez scale", mas para manter hierarquia RX < SC < FD, somamos tudo acima.
      let sumPointsFD = 0;
      let penalidadeBaseFD = sumPointsRX + sumPointsSC;
      groupFoundation.forEach((a, idx) => {
          if(!a.pontosWod) a.pontosWod = {};
          let pts = (idx + 1) + penalidadeBaseFD;
          a.pontosWod[conf.id] = pts;
          sumPointsFD += pts;
      });

      // 4. NÃO REGISTROU (Regra 5)
      // Punição = Soma RX + Soma SC + Soma FD (para garantir que fique atrás de todos)
      // Usamos uma penalidade bem alta para jogar pro fundo
      let penalidadeMissing = sumPointsRX + sumPointsSC + sumPointsFD + 10; 
      
      atletas.forEach((a) => {
        if (!a.pontosWod) a.pontosWod = {};
        // Se não tem ponto neste WOD (não está em nenhum grupo acima)
        if (!a.pontosWod[conf.id]) {
          a.pontosWod[conf.id] = penalidadeMissing;
          a._isMissing = a._isMissing || {};
          a._isMissing[conf.id] = true; // Marca para exibir traço
        }
      });
    });

    // Totais e Ordenação
    atletas.forEach((a) => {
      a._sortTotal = 0;
      a._displayTotal = 0;
      a._tempTieBreak = [];
      a._noResultAll = !a.resultados || a.resultados.length === 0;

      if (fWod === "GERAL") {
        configs.forEach((c) => {
          const pts = a.pontosWod?.[c.id] || 0;
          a._sortTotal += pts;
          a._displayTotal += pts;
          a._tempTieBreak.push(pts);
        });
        a._tempTieBreak.sort((x, y) => x - y);
      } else {
        const wid = Number(fWod);
        a._sortTotal = a.pontosWod?.[wid] || 0;
        a._displayTotal = a.pontosWod?.[wid] || 0;
      }
    });

    atletas.sort((a, b) => {
      if (a._sortTotal !== b._sortTotal) return a._sortTotal - b._sortTotal;
      // Desempate
      if (fWod === "GERAL") {
        const len = Math.max(a._tempTieBreak.length, b._tempTieBreak.length);
        for (let i = 0; i < len; i++) {
          const av = a._tempTieBreak[i] ?? Infinity;
          const bv = b._tempTieBreak[i] ?? Infinity;
          if (av !== bv) return av - bv;
        }
      }
      return 0;
    });

    // Renderização
    let displayList = atletas;
    if (displayList.length === 0) {
      container.innerHTML = "<p style='text-align:center; padding:20px; color:#aaa;'>Nenhum resultado encontrado.</p>";
      return;
    }

    let htmlBuffer = [];
    let encontrouAlgum = false;
    const currentGridStyle = document.querySelector(".list-header.grid-ranking")?.style.getPropertyValue("--grid-cols");
    let lastTier = null;

    displayList.forEach((a, idx) => {
      if (fNome && !a.nome.toLowerCase().includes(fNome)) return;
      encontrouAlgum = true;

      const medalha = idx + 1 === 1 ? "🥇" : idx + 1 === 2 ? "🥈" : idx + 1 === 3 ? "🥉" : `${idx + 1}º`;
      const res = a.resultados || [];
      const tierGeral = Calc.getOverallCategoryTier(res, totalWods);

      // Linha Divisória
      if (fWod === "GERAL") {
        if (lastTier === null || lastTier !== tierGeral) {
           let label = tierGeral === 3 ? "RX" : tierGeral === 2 ? "SCALE" : "FOUNDATION";
           let colorClass = tierGeral === 3 ? "div-rx" : tierGeral === 2 ? "div-sc" : "div-fd";
           htmlBuffer.push(`<div class="category-divider ${colorClass}">${label}</div>`);
        }
      }
      lastTier = tierGeral;

      let catBadge = tierGeral === 3
          ? `<span style="color:#22c55e; border:1px solid #22c55e; font-size:0.7em; padding:0 3px; border-radius:3px; margin-left:6px;">RX</span>`
          : tierGeral === 2
          ? `<span style="color:#fbbf24; border:1px solid #fbbf24; font-size:0.7em; padding:0 3px; border-radius:3px; margin-left:6px;">SC</span>`
          : `<span style="color:#94a3b8; border:1px solid #94a3b8; font-size:0.7em; padding:0 3px; border-radius:3px; margin-left:6px;">FD</span>`;

      let innerRowHTML = "";
      let detailsHTML = "";

      if (fWod === "GERAL") {
        let colsHTML = "";
        configs.forEach((c) => {
          const info = this.getWodInfo(res, c.id);
          // Regra 6: Se não registrou este WOD, mostra "-" (mas a pontuação interna é alta)
          const isMissingThis = a._isMissing && a._isMissing[c.id];
          const ptDisplay = isMissingThis ? "-" : `(${a.pontosWod?.[c.id]})`;
          
          colsHTML += `<div class="wod-col">${info} <span class="pts-wod">${ptDisplay}</span></div>`;
          detailsHTML += `<div class="detalhe-box"><span>${c.nome}</span> ${info}</div>`;
        });

        // Regra 7: Se não tem nenhum resultado, total é "-"
        const totalDisplay = a._noResultAll ? "-" : a._displayTotal;
        const ptsLabel = a._noResultAll ? "" : "<small>pts</small>";

        innerRowHTML = `
          ${colsHTML}
          <div class="score-highlight">${totalDisplay} ${ptsLabel}</div>
          <div class="mobile-result-wrapper" style="display:none;">
              <span class="mobile-wod-cat">TOTAL</span>
              <span class="mobile-result-value">${totalDisplay}</span>
              <span class="mobile-result-points">PTS</span>
          </div>`;
      } else {
        const wodId = Number(fWod);
        const resObj = res.find((r) => r.rodada === wodId);
        const displayScore = resObj ? resObj.score : "-";
        const displayCat = resObj ? resObj.workout : "";
        
        const isMissingThis = a._isMissing && a._isMissing[wodId];
        let displayPt = isMissingThis ? "-" : a.pontosWod?.[wodId];
        const info = this.getWodInfo(res, wodId);

        innerRowHTML = `
          <div class="score-highlight" style="font-size:1.2em;">${displayPt} <small>pts</small></div>
          <div style="font-size:1.1em;" class="wod-col">${info}</div>
          <div class="mobile-result-wrapper" style="display:none;">
              <span class="mobile-wod-cat">${displayCat}</span>
              <span class="mobile-result-value">${displayScore}</span>
              <span class="mobile-result-points">${displayPt} pts</span>
          </div>`;
      }

      htmlBuffer.push(`
        <div class="list-item grid-ranking" style="--grid-cols: ${currentGridStyle || ""}" onclick="UI.toggleRankDetails(${a.id})">
            <div class="posicao">${medalha}</div>
            <div class="text-left nome-col">
                <div class="nome-row"><strong>${a.nome}</strong>${catBadge}</div>
                <div class="info-row">${a.sexo} • ${a.faixa_etaria}</div>
            </div>
            ${innerRowHTML}
        </div>
        <div id="detalhes-${a.id}" class="ranking-details" style="display:none;">
            ${detailsHTML}
        </div>`);
    });

    if (!encontrouAlgum && fNome) {
      container.innerHTML = `<p style='text-align:center; padding:20px; color:#aaa;'>Nenhum atleta encontrado.</p>`;
    } else {
      container.innerHTML = htmlBuffer.join("");
    }
  },

  // ... (Resto das funções auxiliares: toggleRankDetails, edit, etc. permanecem iguais) ...
  
  toggleRankDetails(id) {
    if (window.innerWidth > 768) return;
    const d = document.getElementById(`detalhes-${id}`);
    if (!d) return;
    const l = d.previousElementSibling;
    if (d.style.display === "none") {
      d.style.display = "grid";
      l.style.background = "rgba(0,174,239,0.1)";
    } else {
      d.style.display = "none";
      l.style.background = "var(--card-bg)";
    }
  },
  toggleEdit(id, modo) {
    const campos = ["nome", "sexo", "nasc"];
    campos.forEach((c) => {
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
    ats.forEach((a) => {
      let nd = a.nascimento;
      if (a.nascimento && a.nascimento.includes("-")) {
        const p = a.nascimento.split("-");
        nd = `${p[2]}/${p[1]}/${p[0]}`;
      }
      c.innerHTML += `<div class="list-item grid-inscritos">
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
  async renderConfigWorkouts() {
    const c = document.getElementById("configList");
    if (!c) return;
    c.innerHTML = `<button onclick="UI.addWorkout()" class="admin-btn-add"><span>+</span> CRIAR WORKOUT</button>`;
    const cf = await Data.getConfigs();
    cf.forEach((x) => {
      const i = new Date(x.data_inicio || new Date());
      i.setMinutes(i.getMinutes() - i.getTimezoneOffset());
      const f = new Date(x.data_limite);
      f.setMinutes(f.getMinutes() - f.getTimezoneOffset());
      c.innerHTML += `
        <div class="admin-card">
          <div class="admin-header"><h3>#${x.ordem} WORKOUT ${x.id}</h3><span class="admin-badge-id">ID: ${x.id}</span></div>
          <div class="admin-row">
            <div><label class="admin-label">Nome</label><input type="text" id="nome-${x.id}" value="${x.nome || ''}" class="admin-input"></div>
            <div><label class="admin-label">Ordem</label><input type="number" id="ordem-${x.id}" value="${x.ordem || x.id}" class="admin-input"></div>
          </div>
          <div style="margin-bottom:20px">
            <label class="admin-label">Tipo</label>
            <select id="tipo-${x.id}" class="admin-input">
              <option value="REPS" ${x.tipo === 'REPS' ? 'selected' : ''}>AMRAP</option> 
              <option value="TIME" ${x.tipo === 'TIME' ? 'selected' : ''}>For Time</option>
              <option value="CARGA" ${x.tipo === 'CARGA' ? 'selected' : ''}>Carga Max</option>
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
    const nId = cs.length > 0 ? Math.max(...cs.map((c) => c.id)) + 1 : 1;
    const d = new Date();
    const d2 = new Date();
    d2.setDate(d.getDate() + 7);
    await Data.addConfig({ id: nId, nome: `26.${nId}`, ordem: nId, tipo: "REPS", data_inicio: d.toISOString(), data_limite: d2.toISOString() });
    this.renderConfigWorkouts();
  },
  async deleteWorkout(id) { if (confirm("Excluir?")) { await Data.deleteConfig(id); this.renderConfigWorkouts(); } },
  async salvarConfig(id) {
    const n = document.getElementById(`nome-${id}`).value,
      o = document.getElementById(`ordem-${id}`).value,
      t = document.getElementById(`tipo-${id}`).value,
      i = document.getElementById(`inicio-${id}`).value,
      f = document.getElementById(`fim-${id}`).value;
    await Data.updateConfig(id, { nome: n, ordem: o, tipo: t, data_inicio: new Date(i).toISOString(), data_limite: new Date(f).toISOString() });
    location.reload();
  },
  fmtPt(pt, pen) {
    if (!pt) return "-";
    return `(${pt})`;
  },
  getWodInfo(r, id) {
    const x = r ? r.find((z) => z.rodada === id) : null;
    return x ? `<small>${x.workout}</small><br><strong>${x.score}</strong>` : "-";
  },
  mascaraData(i) {
    let v = i.value.replace(/\D/g, "");
    if (v.length > 2) v = v.replace(/^(\d{2})(\d)/, "$1/$2");
    if (v.length > 5) v = v.replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
    i.value = v;
  },
  formatarDataParaBanco(d) {
    if (!d || d.length !== 10) return "";
    const p = d.split("/");
    return `${p[2]}-${p[1]}-${p[0]}`;
  },
  async initResultados() {
    this.atletasCache = await Data.getAtletas();
    this.configsCache = await Data.getConfigs();
  },
  buscarAtleta(t) {
    const l = document.getElementById("listaSugestoes"),
      i = document.getElementById("atletaId");
    i.value = "";
    if (!t) {
      l.style.display = "none";
      return;
    }
    const f = this.atletasCache.filter((a) => a.nome.toLowerCase().includes(t.toLowerCase()));
    l.innerHTML = "";
    if (f.length) {
      l.style.display = "block";
      f.forEach((a) => {
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
  selecionarAtleta(id, nome, nascimento) {
    document.getElementById("buscaAtleta").value = nome;
    document.getElementById("atletaId").value = id;
    document.getElementById("atletaId").setAttribute("data-nasc-real", nascimento);
    document.getElementById("listaSugestoes").style.display = "none";
  },
  validarAtleta() {
    const i = document.getElementById("atletaId").value,
      d1 = document.getElementById("dataNascimentoLogin").value,
      d2 = document.getElementById("atletaId").getAttribute("data-nasc-real");
    if (!i) return alert("Selecione seu nome.");
    if (this.formatarDataParaBanco(d1) === d2) {
      document.getElementById("loginCard").style.display = "none";
      document.getElementById("formResultados").style.display = "block";
      document.getElementById("nomeAtletaDisplay").textContent =
        document.getElementById("buscaAtleta").value;
      this.verificarPrazo();
    } else {
      alert("Data incorreta!");
    }
  },
  renderOptionsRodada() {
    const select = document.getElementById("rodada");
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = "";
    this.configsCache.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.nome ? `Workout ${c.nome}` : `Workout 26.${c.id}`;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  },
  verificarPrazo() {
    const rodadaId = document.getElementById("rodada").value;
    const config = this.configsCache.find((c) => c.id == rodadaId);
    const btn = document.getElementById("btnSalvarResultado"),
      av = document.getElementById("avisoPrazo"),
      divP = document.getElementById("divPerguntaCap"),
      inp = document.getElementById("score");
    if (!config) return;
    const now = new Date(),
      ini = new Date(config.data_inicio),
      lim = new Date(config.data_limite);
    const opt = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };
    if (now < ini) {
      btn.disabled = true;
      inp.disabled = true;
      btn.textContent = "AGUARDE O INÍCIO";
      btn.style.backgroundColor = "#fbbf24";
      btn.style.color = "#000";
      if (av) {
        av.textContent = `Abre em: ${ini.toLocaleDateString("pt-BR", opt)}`;
        av.style.color = "#fbbf24";
      }
    } else if (now > lim) {
      btn.disabled = true;
      inp.disabled = true;
      btn.textContent = "PRAZO ENCERRADO";
      btn.style.backgroundColor = "#475569";
      btn.style.color = "#fff";
      if (av) {
        av.textContent = `Fechou em: ${lim.toLocaleDateString("pt-BR", opt)}`;
        av.style.color = "#ef4444";
      }
    } else {
      btn.disabled = false;
      inp.disabled = false;
      btn.textContent = "SALVAR RESULTADO";
      btn.style.backgroundColor = "var(--btn-primary)";
      btn.style.color = "#fff";
      if (av) {
        av.textContent = `Aberto até: ${lim.toLocaleDateString("pt-BR", opt)}`;
        av.style.color = "var(--btn-primary)";
      }
    }
    if (config.tipo === "TIME") {
      if (divP) divP.style.display = "block";
      const sim = document.querySelector('input[name="capCheck"][value="SIM"]');
      this.toggleInputType(sim && sim.checked);
    } else {
      // ESSE É O BLOCO PARA CARGA OU REPS
      if (divP) divP.style.display = "none";
      
      const lbl = document.getElementById("labelScore"); // Pega o elemento do título
      
      if (config.tipo === "CARGA") {
          inp.placeholder = "Carga (lb)";
          if(lbl) lbl.textContent = "Carga Máxima"; // <--- MUDA O TEXTO VERDE AQUI
      } else {
          inp.placeholder = "REPS";
          if(lbl) lbl.textContent = "REPS";
      }
      
      inp.type = "number";
    }
  },
  toggleInputType(isTime) {
    const inp = document.getElementById("score"),
      lbl = document.getElementById("labelScore");
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
  async lancarResultado() {
    const btn = document.getElementById("btnSalvarResultado"),
      id = document.getElementById("atletaId").value,
      rod = Number(document.getElementById("rodada").value),
      cat = document.getElementById("workout").value,
      scoreVal = document.getElementById("score").value,
      cf = this.configsCache.find((c) => c.id == rod);
    if (!id || btn.disabled) return;
    if (!scoreVal) return alert("Digite resultado");
    if (cf.tipo === "TIME") {
      const s = document.querySelector('input[name="capCheck"][value="SIM"]').checked;
      if (s && !scoreVal.includes(":")) return alert("Use dois pontos (Ex: 10:30)");
      if (!s && (scoreVal.includes(":") || isNaN(scoreVal))) return alert("Use apenas números.");
    }
    btn.textContent = "Salvando...";
    btn.disabled = true;
    const atl = await Data.getAtletaById(id);
    let res = atl.resultados || [];
    res = res.filter((r) => r.rodada !== rod);
    res.push({ rodada: rod, workout: cat, score: scoreVal });
    const { error } = await Data.updateAtleta(id, { resultados: res });
    if (error) {
      alert("Erro ao salvar: " + error.message);
      btn.textContent = "TENTAR NOVAMENTE";
      btn.disabled = false;
    } else {
      alert("Resultado Salvo!");
      location.reload();
    }
  },
  async cadastrarAtleta() {
    const btn = document.querySelector("button");
    btn.disabled = true;
    const n = document.getElementById("nome").value,
      d = document.getElementById("dataNascimento").value,
      s = document.getElementById("sexo").value;
    if (!n || !d || !s) {
      alert("Preencha tudo");
      btn.disabled = false;
      return;
    }
    if (d.length < 10) {
      alert("Data incompleta");
      btn.disabled = false;
      return;
    }
    const di = this.formatarDataParaBanco(d),
      ex = await Data.getAtletas(),
      dup = ex.find((a) => a.nome.toLowerCase() === n.toLowerCase() && a.nascimento === di);
    if (dup) {
      alert("Já cadastrado");
      btn.disabled = false;
      return;
    }
    await Data.addAtleta({
      nome: n,
      nascimento: di,
      sexo: s,
      faixa_etaria: Calc.getFaixa(Calc.getIdade(di)),
      resultados: [],
    });
    alert("Sucesso!");
    window.location.href = "inscritos.html";
  },
};

// Exports globais
window.cadastrarAtleta = () => UI.cadastrarAtleta();
window.lancarResultado = () => UI.lancarResultado();
window.mostrarRanking = () => UI.renderRanking();
window.UI = UI;

document.addEventListener("DOMContentLoaded", () => UI.init());