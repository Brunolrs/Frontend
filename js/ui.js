/**
 * ============================================================================
 * ui.js — UI CONTROLLER (INTERFACE)
 * Depende de: config.js, data.js, calc.js
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

    if (document.getElementById("listaInscritos"))  await this.renderInscritos();
    if (document.getElementById("buscaAtleta"))     await this.initResultados();
    if (document.getElementById("ranking"))         await this.renderRanking();

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
    supabaseClient
      .channel("tabela-atletas")
      .on("postgres_changes", { event: "*", schema: "public", table: "atletas" }, async (payload) => {
        console.log("Update:", payload);
        this.atletasCache = await Data.getAtletas();
        if (document.getElementById("ranking"))        await this.renderRanking();
        if (document.getElementById("listaInscritos")) await this.renderInscritos();
      })
      .subscribe();
  },

  // ── RANKING ────────────────────────────────────────────────────────────────

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
      h.style.setProperty("--grid-cols", "50px 2fr 1fr 70px");
      const wodName = configs.find((c) => c.id == selectedWodId)?.nome || "Resultado";
      h.innerHTML = `<div>Rank</div><div style="text-align:left">Atleta</div><div style="color:var(--btn-primary)">${wodName}</div><div>PTS</div>`;
    }
  },

  async renderRanking() {
    const container = document.getElementById("ranking");
    if (!container) return;
    if (container.innerHTML.trim() === "")
      container.innerHTML = "<p style='text-align:center; padding:20px;'>Calculando...</p>";

    const configs   = this.configsCache;
    const totalWods = configs.length;
    const fWod      = document.getElementById("workoutFiltro")?.value || "GERAL";
    const fSexo     = document.getElementById("sexoFiltro").value;
    const fCategoria= document.getElementById("categoriaFiltro").value;
    const fFaixa    = document.getElementById("faixaFiltro").value;
    const fNome     = document.getElementById("buscaRanking")?.value.toLowerCase().trim() || "";

    this.renderRankingHeader(configs, fWod);

    let todosAtletas = await Data.getAtletas();

    /**
     * Recalcula pontos para um subconjunto de atletas (padrão CrossFit oficial).
     * Usado tanto para o ranking geral (todos) quanto para rankings filtrados
     * (ex: só Masculino, só faixa 30-34) — em cada caso o 1º do subgrupo = 1 pt.
     *
     * Empate oficial: atletas com score E tiebreak idênticos recebem a MENOR
     * posição do grupo; as posições consumidas são puladas para o próximo.
     * Ex: 2 empatados em 4º → ambos recebem 4 pts, próximo recebe 6 pts.
     */
    const calcularPontosParaGrupo = (grupoAtletas) => {
      // Limpa pontos anteriores para este grupo
      grupoAtletas.forEach((a) => {
        a.pontosWod   = {};
        a._isMissing  = {};
      });

      configs.forEach((conf) => {
        const participantes = [];
        grupoAtletas.forEach((a) => {
          const res = a.resultados?.find((r) => r.rodada === conf.id);
          if (res) participantes.push(a);
        });

        let groupRX = [], groupScale = [], groupFoundation = [];
        participantes.forEach((a) => {
          const res  = a.resultados.find((r) => r.rodada === conf.id);
          const tier = Calc.getTier(res.workout);
          if (tier === 3)      groupRX.push(a);
          else if (tier === 2) groupScale.push(a);
          else                 groupFoundation.push(a);
        });

        groupRX         = Calc.sortGroup(groupRX,         conf.tipo, conf.id);
        groupScale      = Calc.sortGroup(groupScale,      conf.tipo, conf.id);
        groupFoundation = Calc.sortGroup(groupFoundation, conf.tipo, conf.id);

        const assignPoints = (group, offset) => {
          let i = 0; let total = 0;
          while (i < group.length) {
            const resA = group[i].resultados.find((r) => r.rodada === conf.id);
            let j = i + 1;
            while (j < group.length) {
              const resB = group[j].resultados.find((r) => r.rodada === conf.id);
              if (resA.score === resB.score && (resA.tiebreak || null) === (resB.tiebreak || null)) j++;
              else break;
            }
            const sharedPts = (i + 1) + offset;
            for (let k = i; k < j; k++) {
              group[k].pontosWod[conf.id] = sharedPts;
              total += sharedPts;
            }
            i = j;
          }
          return total;
        };

        const sumRX = assignPoints(groupRX, 0);
        const sumSC = assignPoints(groupScale, sumRX);
        const sumFD = assignPoints(groupFoundation, sumRX + sumSC);

        const penalidade = sumRX + sumSC + sumFD + 10;
        grupoAtletas.forEach((a) => {
          if (!a.pontosWod[conf.id]) {
            a.pontosWod[conf.id]  = penalidade;
            a._isMissing[conf.id] = true;
          }
        });
      });
    };

    // ── Determina o subconjunto sobre o qual recalcular ──────────────────────
    // Filtros de sexo e faixa etária recalculam os pontos dentro do subgrupo.
    // Filtro de categoria (RX/Scale/Foundation) e busca por nome são aplicados
    // APÓS o cálculo (não alteram quem compete contra quem dentro da categoria).
    const subGrupo = todosAtletas.filter((a) => {
      const faixa = a.faixa_etaria || a.faixaEtaria;
      return (
        (fSexo  === "TODOS" || a.sexo  === fSexo) &&
        (fFaixa === "GERAL" || faixa   === fFaixa)
      );
    });

    // Recalcula pontos apenas para o subgrupo filtrado
    calcularPontosParaGrupo(subGrupo);

    // Aplica filtro de categoria após o cálculo
    let atletas = subGrupo.filter((a) => {
      const catLabel = Calc.getCategoriaLabel(a.resultados || [], totalWods);
      return (fCategoria === "TODAS" || catLabel === fCategoria);
    });

    atletas.forEach((a) => {
      a._sortTotal    = 0;
      a._displayTotal = 0;
      a._tempTieBreak = [];
      a._noResultAll  = !a.resultados || a.resultados.length === 0;

      if (fWod === "GERAL") {
        configs.forEach((c) => {
          const pts = a.pontosWod?.[c.id] || 0;
          a._sortTotal    += pts;
          a._displayTotal += pts;
          a._tempTieBreak.push(pts);
        });
        a._tempTieBreak.sort((x, y) => x - y);
      } else {
        const wid       = Number(fWod);
        a._sortTotal    = a.pontosWod?.[wid] || 0;
        a._displayTotal = a.pontosWod?.[wid] || 0;
      }
    });

    atletas.sort((a, b) => {
      // 1º critério: menor total de pontos
      if (a._sortTotal !== b._sortTotal) return a._sortTotal - b._sortTotal;

      if (fWod === "GERAL") {
        // 2º critério: comparação pior-para-melhor posição individual (CrossFit padrão)
        const len = Math.max(a._tempTieBreak.length, b._tempTieBreak.length);
        for (let i = 0; i < len; i++) {
          const av = a._tempTieBreak[i] ?? Infinity;
          const bv = b._tempTieBreak[i] ?? Infinity;
          if (av !== bv) return av - bv;
        }

        // 3º critério: soma dos tiebreaks de todos os WODs (menor = mais rápido no geral)
        const tbA = configs.reduce((acc, c) => {
          const r = (a.resultados || []).find((x) => x.rodada === c.id);
          return acc + Calc.parseTiebreak(r?.tiebreak);
        }, 0);
        const tbB = configs.reduce((acc, c) => {
          const r = (b.resultados || []).find((x) => x.rodada === c.id);
          return acc + Calc.parseTiebreak(r?.tiebreak);
        }, 0);
        if (tbA !== tbB) return tbA - tbB;

      } else {
        // WOD específico: tiebreak direto do resultado
        const wodId = Number(fWod);
        const conf  = configs.find((c) => c.id === wodId);
        const resA  = (a.resultados || []).find((r) => r.rodada === wodId);
        const resB  = (b.resultados || []).find((r) => r.rodada === wodId);

        if (resA && resB) {
          // Ambos completaram → aplica lógica hierárquica igual ao sortGroup
          const scoreA = Calc.parseScore(resA.score);
          const scoreB = Calc.parseScore(resB.score);
          const tbA    = Calc.parseTiebreak(resA.tiebreak);
          const tbB    = Calc.parseTiebreak(resB.tiebreak);

          if (conf?.tipo === "TIME") {
            const isTimeA = Calc.isTime(resA.score);
            const isTimeB = Calc.isTime(resB.score);
            if (isTimeA && !isTimeB) return -1;
            if (!isTimeA && isTimeB)  return 1;
            if (scoreA !== scoreB)    return isTimeA ? scoreA - scoreB : scoreB - scoreA;
          } else {
            if (scoreA !== scoreB) return scoreB - scoreA;
          }
          // Empate total → menor tiebreak desempata
          if (tbA !== tbB) return tbA - tbB;
        }
      }

      return 0;
    });

    if (atletas.length === 0) {
      container.innerHTML = "<p style='text-align:center; padding:20px; color:#aaa;'>Nenhum resultado encontrado.</p>";
      return;
    }

    const currentGridStyle = document.querySelector(".list-header.grid-ranking")?.style.getPropertyValue("--grid-cols");
    let htmlBuffer     = [];
    let encontrouAlgum = false;
    let lastTier       = null;

    // Pré-calcula a posição real de cada atleta considerando empates
    // Atletas com _sortTotal idêntico E mesmo tiebreak compartilham a mesma posição
    const posicaoReal = [];
    let pos = 1;
    for (let i = 0; i < atletas.length; i++) {
      if (i > 0 && atletas[i]._sortTotal === atletas[i - 1]._sortTotal) {
        posicaoReal.push(posicaoReal[i - 1]); // mesmo rank
      } else {
        posicaoReal.push(pos);
      }
      pos++;
    }

    atletas.forEach((a, idx) => {
      if (fNome && !a.nome.toLowerCase().includes(fNome)) return;
      encontrouAlgum = true;

      const rank    = posicaoReal[idx];
      const medalhaEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
      const medalha = medalhaEmoji
        ? `<span class="pos-emoji">${medalhaEmoji}</span>`
        : `<span class="pos-num pos-num--plain">${rank}º</span>`;
      const res     = a.resultados || [];

      // Badge e divisória: categoria do WOD específico ou geral do campeonato
      let tierGeral;
      if (fWod !== "GERAL") {
        const resWod = res.find((r) => r.rodada === Number(fWod));
        tierGeral = resWod ? Calc.getTier(resWod.workout) : 1;
      } else {
        tierGeral = Calc.getOverallCategoryTier(res, totalWods);
      }

      if (lastTier === null || lastTier !== tierGeral) {
        const label      = tierGeral === 3 ? "RX" : tierGeral === 2 ? "SCALE" : "FOUNDATION";
        const colorClass = tierGeral === 3 ? "div-rx" : tierGeral === 2 ? "div-sc" : "div-fd";
        htmlBuffer.push(`<div class="category-divider ${colorClass}">${label}</div>`);
      }
      lastTier = tierGeral;

      const catBadge =
        tierGeral === 3
          ? `<span style="color:#22c55e;border:1px solid #22c55e;font-size:0.7em;padding:0 3px;border-radius:3px;margin-left:6px;">RX</span>`
          : tierGeral === 2
          ? `<span style="color:#fbbf24;border:1px solid #fbbf24;font-size:0.7em;padding:0 3px;border-radius:3px;margin-left:6px;">SC</span>`
          : `<span style="color:#94a3b8;border:1px solid #94a3b8;font-size:0.7em;padding:0 3px;border-radius:3px;margin-left:6px;">FD</span>`;

      let innerRowHTML = "";
      let detailsHTML  = "";

      if (fWod === "GERAL") {
        let colsHTML = "";
        configs.forEach((c) => {
          const info          = this.getWodInfo(res, c.id);
          const isMissingThis = a._isMissing?.[c.id];
          const wodPts        = a.pontosWod?.[c.id];
          const ptDisplay     = isMissingThis ? "-" : `(${wodPts})`;
          colsHTML    += `<div class="wod-col">${info} <span class="pts-wod">${ptDisplay}</span></div>`;

          // Posição real neste WOD (pontosWod === colocação no CrossFit scoring)
          const posWod   = isMissingThis || !wodPts ? null : wodPts;
          const posEmoji = posWod === 1 ? "🥇" : posWod === 2 ? "🥈" : posWod === 3 ? "🥉" : null;
          const posLabel = posWod
            ? `<div class="detalhe-pos">${posEmoji
                ? `<span class="detalhe-pos-emoji">${posEmoji}</span>`
                : `<span class="detalhe-pos-num">${posWod}º</span>`
              }</div>`
            : `<div class="detalhe-pos"><span class="detalhe-pos-miss">—</span></div>`;

          detailsHTML += `<div class="detalhe-box">`+
            `<span class="detalhe-wod-nome">${c.nome}</span>`+
            `${posLabel}`+
            `<div class="detalhe-info">${info}</div>`+
            `</div>`;
        });

        const totalDisplay = a._noResultAll ? "-" : a._displayTotal;
        const ptsLabel     = a._noResultAll ? ""  : "<small>pts</small>";

        innerRowHTML = `
          ${colsHTML}
          <div class="score-highlight">${totalDisplay} ${ptsLabel}</div>
          <div class="mobile-result-wrapper">
            <span class="mobile-wod-cat">TOTAL</span>
            <span class="mobile-result-value">${totalDisplay}</span>
            <span class="mobile-result-points">PTS</span>
          </div>`;
      } else {
        const wodId         = Number(fWod);
        const resObj        = res.find((r) => r.rodada === wodId);
        const displayScore  = resObj ? resObj.score   : "-";
        const displayCat    = resObj ? resObj.workout : "";
        const displayTb     = resObj?.tiebreak || null;
        const isMissingThis = a._isMissing?.[wodId];
        const displayPt     = isMissingThis ? "-" : a.pontosWod?.[wodId];
        const info          = this.getWodInfo(res, wodId);
        const tbMobile      = displayTb
          ? `<span class="tb-badge" style="margin-top:3px;">⏱ ${displayTb}</span>`
          : "";

        innerRowHTML = `
          <div class="score-highlight" style="font-size:1.2em;">${displayPt} <small>pts</small></div>
          <div style="font-size:1.1em;" class="wod-col">${info}</div>
          <div class="mobile-result-wrapper">
            <span class="mobile-wod-cat">${displayCat}</span>
            <span class="mobile-result-value">${displayScore}</span>
            <span class="mobile-result-points">${displayPt} pts</span>
            ${tbMobile}
          </div>`;
      }

      htmlBuffer.push(`
        <div class="list-item grid-ranking" style="--grid-cols: ${currentGridStyle || ""}"
             onclick="UI.toggleRankDetails(${a.id})">
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
      container.innerHTML = "<p style='text-align:center; padding:20px; color:#aaa;'>Nenhum atleta encontrado.</p>";
    } else {
      container.innerHTML = htmlBuffer.join("");
    }
  },

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

  // ── INSCRITOS ──────────────────────────────────────────────────────────────

  async renderInscritos() {
    const c = document.getElementById("listaInscritos");
    if (!c) return;
    c.innerHTML = "<p style='text-align:center'>Carregando...</p>";
    const ats = await Data.getAtletas();
    c.innerHTML = "";
    ats.forEach((a) => {
      let nd = a.nascimento;
      if (nd && nd.includes("-")) {
        const p = nd.split("-");
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
            <button onclick="UI.toggleEdit(${a.id}, true)">✏️</button>
            <button id="sv-${a.id}" style="display:none;background:var(--btn-success);color:white" onclick="UI.salvarEdicao(${a.id})">💾</button>
            <button style="background:var(--btn-delete)" onclick="UI.excluirAtleta(${a.id})">🗑️</button>
          </div>
        </div>`;
    });
  },

  toggleEdit(id, modo) {
    ["nome", "sexo", "nasc"].forEach((campo) => {
      const el = document.getElementById(`${campo}-${id}`);
      if (!el) return;
      el.disabled = !modo;
      el.classList.toggle("input-editavel", modo);
      if (modo && campo === "nome") el.focus();
    });
    const btn = document.getElementById(`sv-${id}`);
    if (btn) btn.style.display = modo ? "inline-block" : "none";
  },

  async salvarEdicao(id) {
    const nome = document.getElementById(`nome-${id}`).value;
    const sexo = document.getElementById(`sexo-${id}`).value;
    const nasc = document.getElementById(`nasc-${id}`).value;
    if (!nome || !nasc) return alert("Preencha todos os campos");
    const di    = this.formatarDataParaBanco(nasc);
    const faixa = Calc.getFaixa(Calc.getIdade(di));
    const btn   = document.getElementById(`sv-${id}`);
    const org   = btn.textContent;
    btn.textContent = "...";
    btn.disabled    = true;
    const { error } = await Data.updateAtleta(id, { nome, sexo, nascimento: di, faixa_etaria: faixa });
    if (error) {
      alert("Erro: " + error.message);
      btn.textContent = org;
      btn.disabled    = false;
    } else {
      alert("Atualizado!");
      this.renderInscritos();
    }
  },

  async excluirAtleta(id) {
    if (confirm("Excluir?")) {
      await Data.deleteAtleta(id);
      this.renderInscritos();
    }
  },

  // ── CONFIG WORKOUTS ────────────────────────────────────────────────────────

  async renderConfigWorkouts() {
    const c = document.getElementById("configList");
    if (!c) return;
    c.innerHTML = `<button onclick="UI.addWorkout()" class="admin-btn-add"><span>+</span> CRIAR WORKOUT</button>`;
    const cf = await Data.getConfigs();
    cf.forEach((x) => {
      const ini = new Date(x.data_inicio || new Date());
      ini.setMinutes(ini.getMinutes() - ini.getTimezoneOffset());
      const fim = new Date(x.data_limite);
      fim.setMinutes(fim.getMinutes() - fim.getTimezoneOffset());
      c.innerHTML += `
        <div class="admin-card">
          <div class="admin-header"><h3>#${x.ordem} WORKOUT ${x.id}</h3><span class="admin-badge-id">ID: ${x.id}</span></div>
          <div class="admin-row">
            <div><label class="admin-label">Nome</label><input type="text" id="nome-${x.id}" value="${x.nome || ""}" class="admin-input"></div>
            <div><label class="admin-label">Ordem</label><input type="number" id="ordem-${x.id}" value="${x.ordem || x.id}" class="admin-input"></div>
          </div>
          <div style="margin-bottom:20px">
            <label class="admin-label">Tipo</label>
            <select id="tipo-${x.id}" class="admin-input">
              <option value="REPS"  ${x.tipo === "REPS"  ? "selected" : ""}>AMRAP</option>
              <option value="TIME"  ${x.tipo === "TIME"  ? "selected" : ""}>For Time</option>
              <option value="CARGA" ${x.tipo === "CARGA" ? "selected" : ""}>Carga Max</option>
            </select>
          </div>
          <div class="admin-row">
            <div><label class="admin-label" style="color:#fbbf24">Abertura</label><input type="datetime-local" id="inicio-${x.id}" value="${ini.toISOString().slice(0, 16)}" class="admin-input date-start"></div>
            <div><label class="admin-label" style="color:#ef4444">Fechamento</label><input type="datetime-local" id="fim-${x.id}" value="${fim.toISOString().slice(0, 16)}" class="admin-input date-end"></div>
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
    const cs  = await Data.getConfigs();
    const nId = cs.length > 0 ? Math.max(...cs.map((c) => c.id)) + 1 : 1;
    const d   = new Date();
    const d2  = new Date();
    d2.setDate(d.getDate() + 7);
    await Data.addConfig({ id: nId, nome: `26.${nId}`, ordem: nId, tipo: "REPS", data_inicio: d.toISOString(), data_limite: d2.toISOString() });
    this.renderConfigWorkouts();
  },

  async deleteWorkout(id) {
    if (confirm("Excluir?")) { await Data.deleteConfig(id); this.renderConfigWorkouts(); }
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

  // ── RESULTADOS ─────────────────────────────────────────────────────────────

  async initResultados() {
    this.atletasCache = await Data.getAtletas();
    this.configsCache = await Data.getConfigs();
  },

  buscarAtleta(t) {
    const lista = document.getElementById("listaSugestoes");
    const inp   = document.getElementById("atletaId");
    inp.value = "";
    if (!t) { lista.style.display = "none"; return; }
    const filtrados = this.atletasCache.filter((a) => a.nome.toLowerCase().includes(t.toLowerCase()));
    lista.innerHTML = "";
    if (filtrados.length) {
      lista.style.display = "block";
      filtrados.forEach((a) => {
        const d = document.createElement("div");
        d.className = "sugestao-item";
        d.innerHTML = `<strong>${a.nome}</strong> <small>(${a.sexo})</small>`;
        d.onclick = () => {
          document.getElementById("buscaAtleta").value = a.nome;
          inp.value = a.id;
          inp.setAttribute("data-nasc-real", a.nascimento);
          lista.style.display = "none";
        };
        lista.appendChild(d);
      });
    } else {
      lista.style.display = "none";
    }
  },

  selecionarAtleta(id, nome, nascimento) {
    document.getElementById("buscaAtleta").value = nome;
    document.getElementById("atletaId").value    = id;
    document.getElementById("atletaId").setAttribute("data-nasc-real", nascimento);
    document.getElementById("listaSugestoes").style.display = "none";
  },

  validarAtleta() {
    const id = document.getElementById("atletaId").value;
    const d1 = document.getElementById("dataNascimentoLogin").value;
    const d2 = document.getElementById("atletaId").getAttribute("data-nasc-real");
    if (!id) return alert("Selecione seu nome.");
    if (this.formatarDataParaBanco(d1) === d2) {
      document.getElementById("loginCard").style.display      = "none";
      document.getElementById("formResultados").style.display = "block";
      document.getElementById("nomeAtletaDisplay").textContent = document.getElementById("buscaAtleta").value;
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
      const opt       = document.createElement("option");
      opt.value       = c.id;
      opt.textContent = c.nome ? `Workout ${c.nome}` : `Workout 26.${c.id}`;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  },

  verificarPrazo() {
    const rodadaId    = document.getElementById("rodada").value;
    const config      = this.configsCache.find((c) => c.id == rodadaId);
    const btn         = document.getElementById("btnSalvarResultado");
    const av          = document.getElementById("avisoPrazo");
    const divP        = document.getElementById("divPerguntaCap");
    const inp         = document.getElementById("score");
    const divTiebreak = document.getElementById("divTiebreak");
    if (!config) return;

    const now = new Date();
    const ini = new Date(config.data_inicio);
    const lim = new Date(config.data_limite);
    const opt = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };

    if (now < ini) {
      btn.disabled = true; inp.disabled = true;
      btn.textContent = "AGUARDE O INÍCIO";
      btn.style.backgroundColor = "#fbbf24"; btn.style.color = "#000";
      if (av) { av.textContent = `Abre em: ${ini.toLocaleDateString("pt-BR", opt)}`; av.style.color = "#fbbf24"; }
    } else if (now > lim) {
      btn.disabled = true; inp.disabled = true;
      btn.textContent = "PRAZO ENCERRADO";
      btn.style.backgroundColor = "#475569"; btn.style.color = "#fff";
      if (av) { av.textContent = `Fechou em: ${lim.toLocaleDateString("pt-BR", opt)}`; av.style.color = "#ef4444"; }
    } else {
      btn.disabled = false; inp.disabled = false;
      btn.textContent = "SALVAR RESULTADO";
      btn.style.backgroundColor = "var(--btn-primary)"; btn.style.color = "#fff";
      if (av) { av.textContent = `Aberto até: ${lim.toLocaleDateString("pt-BR", opt)}`; av.style.color = "var(--btn-primary)"; }
    }

    if (config.tipo === "TIME") {
      if (divP)        divP.style.display        = "block";
      if (divTiebreak) divTiebreak.style.display  = "block";
      const sim = document.querySelector('input[name="capCheck"][value="SIM"]');
      this.toggleInputType(sim && sim.checked);
    } else if (config.tipo === "REPS") {
      if (divP)        divP.style.display        = "none";
      if (divTiebreak) divTiebreak.style.display  = "block";
      const lbl = document.getElementById("labelScore");
      inp.placeholder = "REPS"; if (lbl) lbl.textContent = "REPS"; inp.type = "number";
    } else {
      if (divP)        divP.style.display        = "none";
      if (divTiebreak) divTiebreak.style.display  = "none";
      const lbl = document.getElementById("labelScore");
      inp.placeholder = "Carga (lb)"; if (lbl) lbl.textContent = "Carga Máxima"; inp.type = "number";
    }
  },

  toggleInputType(isTime) {
    const inp = document.getElementById("score");
    const lbl = document.getElementById("labelScore");
    inp.value = "";
    if (isTime) {
      if (lbl) lbl.textContent = "Tempo";
      inp.placeholder = "Ex: 12:30"; inp.type = "text";
    } else {
      if (lbl) lbl.textContent = "Reps";
      inp.placeholder = "Ex: 185"; inp.type = "number";
    }
  },

  async lancarResultado() {
    const btn         = document.getElementById("btnSalvarResultado");
    const id          = document.getElementById("atletaId").value;
    const rod         = Number(document.getElementById("rodada").value);
    const cat         = document.getElementById("workout").value;
    const scoreVal    = document.getElementById("score").value;
    const tiebreakVal = (document.getElementById("tiebreak")?.value || "").trim();
    const cf          = this.configsCache.find((c) => c.id == rod);

    if (!id || btn.disabled) return;
    if (!scoreVal) return alert("Digite resultado");

    if (cf.tipo === "TIME") {
      const terminou = document.querySelector('input[name="capCheck"][value="SIM"]').checked;
      if (terminou  && !scoreVal.includes(":"))                     return alert("Use MM:SS para o tempo. Ex: 10:30");
      if (!terminou && (scoreVal.includes(":") || isNaN(scoreVal))) return alert("Use apenas números de reps.");
    }

    if ((cf.tipo === "TIME" || cf.tipo === "REPS") && tiebreakVal) {
      if (!/^\d{1,2}:\d{2}$/.test(tiebreakVal)) return alert("Tiebreak inválido. Use MM:SS (Ex: 05:20)");
    }

    btn.textContent = "Salvando..."; btn.disabled = true;

    const atl = await Data.getAtletaById(id);
    let   res = atl.resultados || [];
    res = res.filter((r) => r.rodada !== rod);

    const novoResultado = { rodada: rod, workout: cat, score: scoreVal };
    if (cf.tipo === "TIME" || cf.tipo === "REPS") {
      novoResultado.tiebreak = tiebreakVal || null;
    }
    res.push(novoResultado);

    const { error } = await Data.updateAtleta(id, { resultados: res });
    if (error) {
      alert("Erro ao salvar: " + error.message);
      btn.textContent = "TENTAR NOVAMENTE"; btn.disabled = false;
    } else {
      alert("Resultado Salvo!"); location.reload();
    }
  },

  // ── CADASTRO ───────────────────────────────────────────────────────────────

  async cadastrarAtleta() {
    const btn = document.querySelector("button");
    btn.disabled = true;
    const n = document.getElementById("nome").value;
    const d = document.getElementById("dataNascimento").value;
    const s = document.getElementById("sexo").value;
    if (!n || !d || !s)  { alert("Preencha tudo"); btn.disabled = false; return; }
    if (d.length < 10)   { alert("Data incompleta"); btn.disabled = false; return; }
    const di  = this.formatarDataParaBanco(d);
    const ex  = await Data.getAtletas();
    const dup = ex.find((a) => a.nome.toLowerCase() === n.toLowerCase() && a.nascimento === di);
    if (dup) { alert("Já cadastrado"); btn.disabled = false; return; }
    await Data.addAtleta({ nome: n, nascimento: di, sexo: s, faixa_etaria: Calc.getFaixa(Calc.getIdade(di)), resultados: [] });
    alert("Sucesso!");
    window.location.href = "inscritos.html";
  },

  // ── UTILITÁRIOS ────────────────────────────────────────────────────────────

  getWodInfo(r, id) {
    const x = r ? r.find((z) => z.rodada === id) : null;
    if (!x) return "-";
    const tb = x.tiebreak
      ? `<span class="tb-badge">⏱ ${x.tiebreak}</span>`
      : "";
    return `<small>${x.workout}</small><br><strong>${x.score}</strong>${tb ? `<br>${tb}` : ""}`;
  },

  /** Retorna dados brutos do resultado de um WOD para uso nos blocos mobile */
  getWodData(r, id) {
    const x = r ? r.find((z) => z.rodada === id) : null;
    if (!x) return { score: "-", workout: "", tiebreak: null };
    return { score: x.score, workout: x.workout, tiebreak: x.tiebreak || null };
  },

  mascaraData(i) {
    let v = i.value.replace(/\D/g, "");
    if (v.length > 2) v = v.replace(/^(\d{2})(\d)/, "$1/$2");
    if (v.length > 5) v = v.replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
    i.value = v;
  },

  mascaraTempo(i) {
    let v = i.value.replace(/\D/g, "");
    if (v.length > 2) v = v.slice(0, 2) + ":" + v.slice(2, 4);
    i.value = v;
  },

  formatarDataParaBanco(d) {
    if (!d || d.length !== 10) return "";
    const p = d.split("/");
    return `${p[2]}-${p[1]}-${p[0]}`;
  },
};

window.UI              = UI;
window.cadastrarAtleta = () => UI.cadastrarAtleta();
window.lancarResultado = () => UI.lancarResultado();
window.mostrarRanking  = () => UI.renderRanking();

document.addEventListener("DOMContentLoaded", () => UI.init());